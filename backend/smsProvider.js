import dotenv from "dotenv";
dotenv.config();

import twilio from "twilio";

class SMSProvider {
  constructor() {
    this.providerName = process.env.SMS_PROVIDER || "MOCK";
  }

  async sendSMS(to, message) {
    console.log(`=== SMS PROVIDER ===`);
    console.log(`Proveedor: ${this.providerName}`);
    console.log(`Destinatario: ${to}`);
    console.log(`Mensaje: ${message}`);
    console.log(`====================`);
    
    // De-coupled SMS provider integration logic
    switch (this.providerName) {
      case "TWILIO":
        try {
          const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
          const targetPhone = to.startsWith("+") ? to : `+51${to}`;
          
          await client.messages.create({
            body: message,
            to: targetPhone,
            from: process.env.TWILIO_PHONE,
          });
          console.log(`[TWILIO SMS] OTP successfully sent to ${targetPhone}.`);
        } catch (err) {
          console.error("[TWILIO SMS] Error sending SMS:", err.message);
          throw err;
        }
        break;
      case "VONAGE":
        // Future integration: Vonage/Nexmo
        break;
      case "AWS_SNS":
        // Future integration: AWS Simple Notification Service
        break;
      case "MESSAGEBIRD":
        // Future integration: MessageBird
        break;
      case "MOCK":
      default:
        console.log(`[MOCK SMS] OTP successfully sent to ${to}.`);
        break;
    }
    return { success: true, provider: this.providerName };
  }
}

export const smsProvider = new SMSProvider();
