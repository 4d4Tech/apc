
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function run() {
    console.log("Using API Key starting with:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : 'undefined');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
        const result = await model.generateContent("Hello!");
        console.log("Success! Response:", result.response.text());
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
