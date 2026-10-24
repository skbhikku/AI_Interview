require('dotenv').config();
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
  to: 'skbhikkusaheb@gmail.com', // Change to your testing email
  from: process.env.FROM_EMAIL,     // Must match your verified sender
  subject: 'Test Email from SendGrid',
  text: 'Hello from SendGrid using Node.js!',
  html: '<strong>Hello from SendGrid using Node.js!</strong>',
};

sgMail
  .send(msg)
  .then(() => console.log('✅ Email sent'))
  .catch((error) => console.error('❌ Error sending email:', error.response?.body || error.message));
