// sendEmail.js
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    // Optional: force direct connection
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
});

async function sendEmail(to, subject, html) {
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            html
        });
        console.log('✅ Email sent successfully:', info.messageId);
    } catch (error) {
        console.error('❌ Error sending email:', error.message);
        if (error.code === 'ESOCKET') {
            console.log('\n💡 Tip: This is usually a network / firewall / proxy issue.');
        }
    }
}

// Test it
sendEmail('hesocapopoba25@gmail.com', 'Test Email', '<h1>Hello from Node.js</h1>');