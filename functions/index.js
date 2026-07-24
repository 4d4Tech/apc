const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");
const { GoogleGenerativeAI } = require("@google/generative-ai");

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

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

        return { success: true, uid: userRecord.uid };
    } catch (error) {
        console.error("Error creating operator:", error);
        throw new HttpsError('internal', error.message || 'Failed to create operator.');
    }
});

exports.generatepaystub = onCall(async (request) => {
    // implementation to come later
    return { success: true };
});
