const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key');
const { onRequest } = require("firebase-functions/v2/https");
const { decryptPii, extractLast4, formatSsnOrEin, maskPii } = require('./piiCrypto');

initializeApp();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.extractbatchdata = onCall(async (request) => {
    const imageUrl = request.data.imageUrl;

    if (!imageUrl) {
        throw new HttpsError('invalid-argument', 'The function must be called with an imageUrl.');
    }

    try {
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';

        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });


        const prompt = `Extract the 'Total Amount' and the number of transactions/record count (which represents the expected item count/boots) from this batch summary ticket. Return ONLY a valid JSON object exactly like this: {"batchTotalAmount": 123.45, "expectedItemCount": 5}. Do not include any markdown formatting or extra text.`;
        const imageParts = [
            {
                inlineData: {
                    data: base64Image,
                    mimeType
                }
            }
        ];

        const result = await model.generateContent([prompt, ...imageParts]);
        const textResponse = result.response.text();

        // Strip markdown code blocks if any
        let cleanText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanText);

        return data;
    } catch (error) {
        console.error("AI Extraction Error:", error);
        throw new HttpsError('internal', 'Failed to extract data from image.');
    }
});

const { getAuth } = require("firebase-admin/auth");

exports.addOperator = onCall(async (request) => {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'Only authenticated admins can add operators.');
    }

    const adminDoc = await getFirestore().collection('users').doc(request.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only admins can add operators.');
    }

    const { email, password, firstName, lastName, phone } = request.data;
    if (!email || !password || !firstName || !lastName) {
        throw new HttpsError('invalid-argument', 'Missing required fields.');
    }

    try {
        const userRecord = await getAuth().createUser({
            email,
            password,
            displayName: `${firstName} ${lastName}`.trim(),
        });

        await getFirestore().collection('users').doc(userRecord.uid).set({
            role: 'operator',
            name: userRecord.displayName,
            firstName,
            lastName,
            phone: phone || '',
            email,
            ratePerBoot: 10
        });

        await getAuth().setCustomUserClaims(userRecord.uid, { operator: true });

        return { success: true, uid: userRecord.uid };
    } catch (error) {
        console.error("Error creating operator:", error);
        throw new HttpsError('internal', error.message || 'Failed to create operator.');
    }
});

exports.runPayroll = onCall(async (request) => {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'Only authenticated admins can run payroll.');
    }

    const adminDoc = await getFirestore().collection('users').doc(request.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only admins can run payroll.');
    }

    const { batchId } = request.data;
    if (!batchId) {
        throw new HttpsError('invalid-argument', 'Missing batchId.');
    }

    try {
        const batchRef = getFirestore().collection('batches').doc(batchId);
        const batchDoc = await batchRef.get();

        if (!batchDoc.exists) {
            throw new HttpsError('not-found', 'Batch not found.');
        }

        const batchData = batchDoc.data();
        if (batchData.status !== 'verified') {
            throw new HttpsError('failed-precondition', 'Batch must be verified to run payroll.');
        }

        const operatorDoc = await getFirestore().collection('users').doc(batchData.operatorId).get();
        const operatorData = operatorDoc.exists ? operatorDoc.data() : {};

        const totalAmount = batchData.calculatedPay || 0;
        let finalAmount = totalAmount;
        if (batchData.adjustments && Array.isArray(batchData.adjustments)) {
            batchData.adjustments.forEach(adj => {
                const amt = Number(adj.amount) || 0;
                if (adj.type === 'deduction') finalAmount -= amt;
                if (adj.type === 'reimbursement') finalAmount += amt;
                if (adj.type === 'bonus') finalAmount += amt;
            });
        }

        // Calculate and update YTD
        const batchDate = batchData.date ? batchData.date.toDate() : new Date();
        const year = batchDate.getFullYear().toString();
        const currentYTD = (operatorData.ytdEarnings && operatorData.ytdEarnings[year]) ? operatorData.ytdEarnings[year] : 0;
        const newYTD = currentYTD + finalAmount;

        await getFirestore().collection('users').doc(batchData.operatorId).update({
            [`ytdEarnings.${year}`]: newYTD
        });

        if (operatorData.stripeAccountId && finalAmount > 0) {
            console.log(`Simulated transfer to ${operatorData.stripeAccountId} for $${finalAmount}`);
            /* 
            // Real implementation would look like this:
            const transfer = await stripe.transfers.create({
                amount: Math.round(finalAmount * 100),
                currency: "usd",
                destination: operatorData.stripeAccountId,
                metadata: { batchId: batchId }
            });
            */
        }

        await batchRef.update({
            status: 'paid',
            finalPayoutAmount: finalAmount,
            paidAt: new Date(),
            payrollRunAt: new Date(),
            ytdAtPayrollRun: newYTD
        });

        return { success: true, finalAmount };
    } catch (error) {
        console.error("Error running payroll:", error);
        throw new HttpsError('internal', error.message || 'Failed to run payroll.');
    }
});

exports.stripeWebhook = onRequest(async (req, res) => {
    const event = req.body;
    try {
        if (event.type === 'payout.paid' || event.type === 'transfer.paid') {
            console.log("Payout paid:", event);
            // Assuming we pass batchId in transfer metadata
            const batchId = event.data.object.metadata?.batchId;
            if (batchId) {
                await getFirestore().collection('batches').doc(batchId).update({
                    status: 'paid',
                    paidAt: new Date()
                });
                console.log(`Updated batch ${batchId} to paid status.`);
            }
        }
        res.status(200).send('Webhook received');
    } catch (err) {
        console.error('Webhook error:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
});

exports.generatepaystub = onCall(async (request) => {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'Only admins can generate paystubs.');
    }
    const adminDoc = await getFirestore().collection('users').doc(request.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only admins can generate paystubs.');
    }

    const { batchId } = request.data;
    if (!batchId) throw new HttpsError('invalid-argument', 'Missing batchId.');

    try {
        const batchRef = getFirestore().collection('batches').doc(batchId);
        const batchDoc = await batchRef.get();
        if (!batchDoc.exists) throw new HttpsError('not-found', 'Batch not found.');
        
        const batchData = batchDoc.data();
        const operatorId = batchData.operatorId;

        const operatorDoc = await getFirestore().collection('users').doc(operatorId).get();
        const operatorData = operatorDoc.exists ? operatorDoc.data() : {};

        const secureDoc = await getFirestore().collection('operator_secure_data').doc(operatorId).get();
        const sd = secureDoc.exists ? secureDoc.data() : {};
        let ssnLast4 = sd.ssnLast4;
        if (!ssnLast4 && sd.ssn) {
            const decrypted = await decryptPii(sd.ssn);
            ssnLast4 = extractLast4(decrypted);
        }
        const ssnDisplay = ssnLast4 ? `xxx-xx-${ssnLast4}` : 'xxx-xx-xxxx';

        // Calculate YTD (same logic as 1099, but for the year of the batch)
        const batchDate = batchData.date ? batchData.date.toDate() : new Date();
        const year = batchDate.getFullYear();
        const startOfYear = new Date(`${year}-01-01T00:00:00Z`);
        const endOfYear = new Date(`${year}-12-31T23:59:59Z`);

        let ytdTotal = 0;
        
        const batchesSnap = await getFirestore().collection('batches')
            .where('operatorId', '==', operatorId)
            .where('status', 'in', ['paid', 'processing'])
            .get();

        batchesSnap.docs.forEach(bDoc => {
            const b = bDoc.data();
            const relevantTimestamp = b.payrollRunAt || b.paidAt || b.date;
            if (relevantTimestamp) {
                const runDate = relevantTimestamp.toDate ? relevantTimestamp.toDate() : new Date(relevantTimestamp);
                if (runDate >= startOfYear && runDate <= endOfYear && runDate <= batchDate) {
                    if (b.finalPayoutAmount !== undefined && b.finalPayoutAmount !== null) {
                        ytdTotal += b.finalPayoutAmount;
                    } else {
                        let total = b.calculatedPay || 0;
                        if (b.adjustments && Array.isArray(b.adjustments)) {
                            b.adjustments.forEach(adj => {
                                const amount = Number(adj.amount) || 0;
                                if (adj.type === 'bonus') total += amount;
                                if (adj.type === 'reimbursement') total += amount;
                                if (adj.type === 'deduction') total -= amount;
                            });
                        }
                        ytdTotal += total;
                    }
                }
            }
        });

        // Get transactions for daily breakdown
        const txSnap = await getFirestore().collection(`batches/${batchId}/transactions`).get();
        const transactions = txSnap.docs.map(d => d.data());

        const dailyMap = {};
        transactions.forEach(tx => {
            const d = tx.timestamp ? tx.timestamp.toDate() : batchDate;
            const dayKey = d.toLocaleDateString();
            if (!dailyMap[dayKey]) {
                dailyMap[dayKey] = {
                    dateObj: d,
                    booted: 0
                };
            }
            dailyMap[dayKey].booted += 1;
        });

        const dailyStats = Object.values(dailyMap).sort((a, b) => a.dateObj - b.dateObj).map(d => ({
            day: d.dateObj.toLocaleDateString('en-US', { weekday: 'long' }),
            date: d.dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }),
            booted: d.booted,
            total: d.booted
        }));
        
        // If no transactions, just use the batch date and expected count
        if (dailyStats.length === 0) {
            dailyStats.push({
                day: batchDate.toLocaleDateString('en-US', { weekday: 'long' }),
                date: batchDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }),
                booted: batchData.expectedItemCount || 0,
                total: batchData.expectedItemCount || 0
            });
        }

        const payRate = operatorData.ratePerBoot || 10;
        const totalBooted = dailyStats.reduce((sum, d) => sum + d.booted, 0);
        let basePay = totalBooted * payRate;
        
        // Add adjustments
        let bonus = 0;
        if (batchData.adjustments) {
            batchData.adjustments.forEach(adj => {
                const amount = Number(adj.amount) || 0;
                if (adj.type === 'bonus') bonus += amount;
                if (adj.type === 'reimbursement') basePay += amount;
                if (adj.type === 'deduction') basePay -= amount;
            });
        }

        return {
            success: true,
            data: {
                employee: {
                    name: operatorData.name || 'Unknown',
                    phone: operatorData.phone || 'N/A',
                    email: operatorData.email || 'N/A',
                    ssnLast4: ssnDisplay
                },
                payPeriod: {
                    startDate: dailyStats[0]?.date || batchDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }),
                    endDate: dailyStats[dailyStats.length - 1]?.date || batchDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
                },
                manager: "Frank Martinez",
                dailyStats,
                summary: {
                    payRate: payRate,
                    totalBooted: totalBooted,
                    totalAmount: basePay,
                    bonus: bonus,
                    grossTotal: (basePay + bonus),
                    ytd: ytdTotal || (basePay + bonus)
                }
            }
        };
    } catch (error) {
        console.error("Error generating paystub:", error);
        throw new HttpsError('internal', error.message);
    }
});

exports.generate1099 = onCall(async (request) => {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'Only admins can generate 1099s.');
    }
    const adminDoc = await getFirestore().collection('users').doc(request.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only admins can generate 1099s.');
    }

    const { year } = request.data;
    if (!year) throw new HttpsError('invalid-argument', 'Missing year.');

    try {
        const operatorsSnap = await getFirestore().collection('users').where('role', '==', 'operator').get();
        const results = [];

        const start = new Date(`${year}-01-01T00:00:00Z`);
        const end = new Date(`${year}-12-31T23:59:59Z`);

        for (const opDoc of operatorsSnap.docs) {
            const operatorId = opDoc.id;
            const batchesSnap = await getFirestore().collection('batches')
                .where('operatorId', '==', operatorId)
                .where('status', 'in', ['paid', 'processing'])
                .get();

            let ytdTotal = 0;
            batchesSnap.docs.forEach(bDoc => {
                const b = bDoc.data();
                const relevantTimestamp = b.payrollRunAt || b.paidAt || b.date;
                if (relevantTimestamp) {
                    const runDate = relevantTimestamp.toDate ? relevantTimestamp.toDate() : new Date(relevantTimestamp);
                    if (runDate >= start && runDate <= end) {
                        if (b.finalPayoutAmount !== undefined && b.finalPayoutAmount !== null) {
                            ytdTotal += b.finalPayoutAmount;
                        } else {
                            let total = b.calculatedPay || 0;
                            if (b.adjustments && Array.isArray(b.adjustments)) {
                                b.adjustments.forEach(adj => {
                                    const amount = Number(adj.amount) || 0;
                                    if (adj.type === 'bonus') total += amount;
                                    if (adj.type === 'reimbursement') total += amount;
                                    if (adj.type === 'deduction') total -= amount;
                                });
                            }
                            ytdTotal += total;
                        }
                    }
                }
            });

            if (ytdTotal >= 600) {
                const secureDoc = await getFirestore().collection('operator_secure_data').doc(operatorId).get();
                const sd = secureDoc.exists ? secureDoc.data() : {};
                let decryptedSsn = '';
                if (sd.ssn) {
                    decryptedSsn = await decryptPii(sd.ssn);
                }
                const formattedSsn = formatSsnOrEin(decryptedSsn || sd.maskedSsn || '');

                const opData = opDoc.data();
                const fullName = (opData.firstName || opData.lastName) 
                    ? `${opData.firstName || ''} ${opData.lastName || ''}`.trim() 
                    : opData.name;

                results.push({
                    operatorId,
                    name: fullName,
                    email: opData.email,
                    streetAddress: opDoc.data().streetAddress || '',
                    city: opDoc.data().city || '',
                    state: opDoc.data().state || '',
                    zip: opDoc.data().zip || '',
                    ssnOrEin: formattedSsn || '',
                    ytdTotal
                });
            }
        }

        const adminDoc = await getFirestore().collection('users').doc(request.auth.uid).get();
        const adminSecureDoc = await getFirestore().collection('admin_secure_data').doc(request.auth.uid).get();
        const adminSd = adminSecureDoc.exists ? adminSecureDoc.data() : {};
        let decryptedTin = '';
        if (adminSd.tin) {
            decryptedTin = await decryptPii(adminSd.tin);
        }
        const formattedTin = formatSsnOrEin(decryptedTin || adminSd.maskedTin || 'XX-XXXXXXX');

        const payerInfo = {
            companyName: adminDoc.data()?.companyName || adminDoc.data()?.name || '',
            streetAddress: adminDoc.data()?.streetAddress || '',
            city: adminDoc.data()?.city || '',
            state: adminDoc.data()?.state || '',
            zip: adminDoc.data()?.zip || '',
            phone: adminDoc.data()?.phone || '',
            tin: formattedTin || 'XX-XXXXXXX'
        };

        return { success: true, year, generatedCount: results.length, data: results, payerInfo };
    } catch (error) {
        console.error("Error generating 1099s:", error);
        throw new HttpsError('internal', error.message);
    }
});
