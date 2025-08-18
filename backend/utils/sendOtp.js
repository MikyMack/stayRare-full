const nodemailer = require('nodemailer');

const sendOtp = async (email, otp) => {
    try {
        // Create transporter with your email service credentials
        const transporter = nodemailer.createTransport({
            service: 'gmail', // or your email provider
            auth: {
                user: process.env.EMAIL_USERNAME, // your email
                pass: process.env.EMAIL_PASSWORD   // your email password or app password
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USERNAME,
            to: email,
            subject: 'Your OTP for Registration',
            text: `Your OTP is: ${otp}. It will expire in 5 minutes.`,
            html: `<p>Your OTP is: <strong>${otp}</strong>. It will expire in 5 minutes.</p>`
        };

        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error('Error sending OTP email:', err);
        throw err;
    }
};

module.exports = sendOtp;