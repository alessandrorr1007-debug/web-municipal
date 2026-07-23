import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });
dotenv.config();

class EmailProvider {
  constructor() {
    this.providerName = process.env.EMAIL_PROVIDER || "NODEMAILER";
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    const SMTP_EMAIL = process.env.SMTP_EMAIL || "webmunicipal01@gmail.com";
    const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "qtsifvcupewgxpyn";

    if (SMTP_EMAIL && SMTP_PASSWORD) {
      this.transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: SMTP_EMAIL,
          pass: SMTP_PASSWORD,
        },
      });

      this.transporter.verify().then(() => {
        console.log("[EmailProvider] SMTP Gmail connection verified successfully for:", SMTP_EMAIL);
      }).catch((err) => {
        console.error("[EmailProvider] SMTP Connection error:", err.message);
      });
    } else {
      console.warn("[EmailProvider] SMTP credentials not found.");
    }
  }

  getTransporter() {
    if (!this.transporter) {
      this.initTransporter();
    }
    return this.transporter;
  }

  async sendEmail(to, subject, text, html) {
    console.log(`=== EMAIL PROVIDER ===`);
    console.log(`Proveedor: ${this.providerName}`);
    console.log(`Destinatario: ${to}`);
    console.log(`Asunto: ${subject}`);
    console.log(`======================`);

    const plantilaGenericaHTML = (contenidoTexto) => `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #0f172a; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 18px rgba(0,0,0,0.08);">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 24px 20px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 900; letter-spacing: 0.5px;">MUNICIPALIDAD PROVINCIAL DE TRUJILLO</h2>
          <span style="font-size: 12px; color: #38bdf8; font-weight: bold; text-transform: uppercase; display: block; margin-top: 4px;">Gerencia de Desarrollo Económico Local — Subgerencia de Licencias</span>
        </div>
        <div style="padding: 26px 24px; color: #334155; font-size: 14.5px; line-height: 1.6;">
          <p style="margin: 0 0 16px; font-size: 15px; color: #0f172a;">${contenidoTexto}</p>
        </div>
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; color: #64748b; font-size: 12px;">
          <strong style="color: #0f172a; display: block; margin-bottom: 2px;">Municipalidad Provincial de Trujillo</strong>
          <span>Plataforma Digital de Licencias de Funcionamiento</span>
        </div>
      </div>
    `;

    const transporter = this.getTransporter();
    const smtpEmail = process.env.SMTP_EMAIL || "webmunicipal01@gmail.com";

    if (!transporter) {
      console.warn("[EmailProvider] SMTP transporter null. Simulating email send in console.");
      console.log(`[MOCK EMAIL] To: ${to}\nSubject: ${subject}\nBody: ${text}`);
      return { success: true, provider: "MOCK" };
    }

    try {
      const mailOptions = {
        from: `"Municipalidad Provincial de Trujillo" <${smtpEmail}>`,
        to,
        subject,
        text,
        html: html || plantilaGenericaHTML(text),
      };

      const result = await transporter.sendMail(mailOptions);
      console.log(`[NODEMAILER EMAIL] Successfully sent to ${to}. MessageId: ${result.messageId}`);
      return { success: true, provider: "NODEMAILER", messageId: result.messageId };
    } catch (err) {
      console.error("[NODEMAILER EMAIL] Error sending email:", err.message);
      throw err;
    }
  }
}

export const emailProvider = new EmailProvider();

