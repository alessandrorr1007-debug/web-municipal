import dotenv from "dotenv";
dotenv.config();

import nodemailer from "nodemailer";

class EmailProvider {
  constructor() {
    this.providerName = process.env.EMAIL_PROVIDER || "NODEMAILER";
    
    // Config default Nodemailer transporter
    const SMTP_EMAIL = process.env.SMTP_EMAIL;
    const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
    
    this.transporter = SMTP_EMAIL && SMTP_PASSWORD
      ? nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: {
            user: SMTP_EMAIL,
            pass: SMTP_PASSWORD,
          },
        })
      : null;
      
    if (this.transporter) {
      this.transporter.verify().then(() => {
        console.log("EmailProvider: SMTP Connection verified successfully");
      }).catch((err) => {
        console.error("EmailProvider: SMTP Connection error:", err.message);
      });
    }
  }

  async sendEmail(to, subject, text, html) {
    console.log(`=== EMAIL PROVIDER ===`);
    console.log(`Proveedor: ${this.providerName}`);
    console.log(`Destinatario: ${to}`);
    console.log(`Asunto: ${subject}`);
    console.log(`======================`);

    switch (this.providerName) {
      case "NODEMAILER":
      default:
        if (!this.transporter) {
          console.warn("[EmailProvider] SMTP credentials not configured. Simulating email send in console.");
          console.log(`[MOCK EMAIL] To: ${to}\nSubject: ${subject}\nBody: ${text}`);
          return { success: true, provider: "MOCK" };
        }
        
        try {
          const mailOptions = {
            from: `"WEB-MUNICIPAL" <${process.env.SMTP_EMAIL}>`,
            to,
            subject,
            text,
            html: html || `<div style="font-family: Arial, sans-serif; padding: 20px; color: #1e3a8a; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 500px; margin: 0 auto;">
              <h2 style="color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-top: 0;">Notificación de WEB-MUNICIPAL</h2>
              <p style="font-size: 15px; color: #334155; line-height: 1.5;">${text}</p>
              <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 12px; margin-bottom: 0; text-align: center;">Plataforma Digital WEB-MUNICIPAL</p>
            </div>`
          };
          
          await this.transporter.sendMail(mailOptions);
          console.log(`[NODEMAILER EMAIL] successfully sent to ${to}.`);
        } catch (err) {
          console.error("[NODEMAILER EMAIL] Error sending email:", err.message);
          throw err;
        }
        break;
    }
    return { success: true, provider: this.providerName };
  }
}

export const emailProvider = new EmailProvider();
