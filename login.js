const fyersModel = require("fyers-api-v3").fyersModel;
require("dotenv").config();

// Initialize the Fyers instance
const fyers = new fyersModel();

fyers.setAppId(process.env.FYERS_APP_ID);
fyers.setRedirectUrl(process.env.FYERS_REDIRECT_URL);

async function startLoginFlow() {
    // =========================================================================
    // STEP A: GENERATE AUTHENTICATION URL
    // Run this first. Open the printed link in your browser to log in.
    // =========================================================================
    const authUrl = fyers.generateAuthCode();
    console.log("👉 1. Open this URL in your browser to log in:\n");
    console.log(authUrl);
    console.log("\n=========================================================\n");

    // =========================================================================
    // STEP B: ENTER AUTH CODE TO GET ACCESS TOKEN
    // After logging in, copy the 'auth_code' parameter value from your browser's
    // redirected address bar and paste it into the terminal prompt.
    // =========================================================================
    const readline = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
    });

    readline.question("👉 2. Paste the 'auth_code' from the redirected URL here: ", async (authCode) => {
        readline.close();

        if (!authCode) {
            console.error("❌ Auth code cannot be empty!");
            return;
        }

        try {
            console.log("\n🔄 Exchanging authorization code for Access Token...");
            
            // Generate the access token using the copied auth_code
            const response = await fyers.generateAccessToken({
                secret_key: process.env.FYERS_SECRET_ID,
                auth_code: authCode
            });

            if (response && response.access_token) {
                console.log("\n✅ Login Successful!");
                console.log("-------------------------------------------------");
                console.log("Your Daily Access Token:\n", response.access_token);
                console.log("-------------------------------------------------");
                
                // Optional: Initialize and test a profile request with your active session
                fyers.setAccessToken(response.access_token);
                const profile = await fyers.get_profile();
                console.log("User Profile Data:", profile);
            } else {
                console.log("❌ Token generation failed. Response error:", response);
            }
        } catch (error) {
            console.error("❌ An error occurred during verification:", error.message || error);
        }
    });
}

startLoginFlow();
