const express = require('express');
const router = express.Router();
const { User, Job } = require('../models/user'); // Import the User and Job models
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const jwt = require('jsonwebtoken');
const auth = require('../../backend/routes/auth'); // Import the auth middleware

// Twilio configuration
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Function to validate phone number format
const validatePhoneNumber = (phoneNo) => {
  const phoneRegex = /^\+91\d{10}$/;
  return phoneRegex.test(phoneNo);
};

// Function to generate JWT
const generateToken = (user) => {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Function to send job alert email
const sendJobAlertEmail = async (job, user) => {
  if (!job.candidateEmails || job.candidateEmails.length === 0) {
    console.error('No candidate emails provided.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: job.candidateEmails.join(','), // Join the candidateEmails array into a comma-separated string
    subject: `Job Alert: ${job.jobTitle}`,
    text: `
      Job Title: ${job.jobTitle}
      Job Description: ${job.jobDescription}
      Experience Level: ${job.experienceLevel}
      End Date: ${job.endDate}

      Posted by: ${user.name} (${user.companyEmail})
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Job alert email sent successfully.');
  } catch (error) {
    console.error('Error sending job alert email:', error);
  }
};

// Signup route
router.post('/signup', async (req, res) => {
  const { name, phoneNo, companyName, companyEmail, employeeSize } = req.body;
  try {
    // Validate input data
    if (!name || !phoneNo || !companyName || !companyEmail || !employeeSize) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Validate phone number format
    if (!validatePhoneNumber(phoneNo)) {
      return res.status(400).json({ message: 'Invalid phone number format. It should be in the format +91XXXXXXXXXX.' });
    }

    // Generate email verification OTP
    const emailVerificationOTP = crypto.randomBytes(3).toString('hex'); // Generate a 6-character OTP
    const emailVerificationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    const newUser = new User({
      name,
      phoneNo,
      companyName,
      companyEmail,
      employeeSize,
      isVerified: false,
      isEmailVerified: false,
      isMobileVerified: false,
      emailVerificationOTP,
      emailVerificationExpires,
    });
    await newUser.save();

    console.log('New user created:', newUser);

    // Send email verification OTP
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Use the app password here
      },
    });

    const mailOptions = {
      to: companyEmail,
      from: process.env.EMAIL_USER,
      subject: 'Email Verification',
      text: `You are receiving this because you (or someone else) requested the verification of your email for your account.\n\n
      Your OTP for email verification is: ${emailVerificationOTP}\n\n
      If you did not request this, please ignore this email, and your account will remain inactive.\n`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to ${companyEmail}`);

    // Send mobile verification OTP using Twilio Verify API
    const verification = await twilioClient.verify.services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications
      .create({ to: phoneNo, channel: 'sms' });
    console.log(`Mobile verification OTP sent to ${phoneNo}: ${verification.sid}`);

    // Respond with a success message immediately after saving the user
    res.status(200).json({
      message: 'User registered successfully. Verification email and mobile OTP sent.',
    });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key error
      res.status(400).json({ message: 'Email is already in use.' });
    } else {
      console.error(err);
      res.status(400).json({ message: err.message });
    }
  }
});

// Email verification route
router.post('/verify-email', async (req, res) => {
  const { email, otp } = req.body;
  try {
    console.log('Verifying email with OTP:', otp);
    const user = await User.findOne({
      companyEmail: email,
      emailVerificationOTP: otp,
      emailVerificationExpires: { $gt: Date.now() }, // Check if OTP is valid and not expired
    });

    if (!user) {
      console.log('Email verification OTP is invalid or has expired.');
      return res.status(400).json({ message: 'Email verification OTP is invalid or has expired.' });
    }

    user.isEmailVerified = true;
    user.emailVerificationOTP = undefined;
    user.emailVerificationExpires = undefined;
    
    // Check if both email and mobile are verified
    if (user.isMobileVerified) {
      user.isVerified = true;
    }
    
    // Generate JWT token
    const token = generateToken(user);
    user.jwtToken = token; // Save the token in the user document

    await user.save();

    res.status(200).json({
      message: 'Email verified successfully.',
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
});

// Mobile verification route
router.post('/verify-mobile', async (req, res) => {
  const { phoneNo, otp } = req.body;
  try {
    console.log('Verifying mobile with OTP:', otp);
    const verificationCheck = await twilioClient.verify.services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks
      .create({ to: phoneNo, code: otp });

    if (verificationCheck.status !== 'approved') {
      console.log('Mobile verification OTP is invalid or has expired.');
      return res.status(400).json({ message: 'Mobile verification OTP is invalid or has expired.' });
    }

    const user = await User.findOne({ phoneNo });

    if (!user) {
      return res.status(400).json({ message: 'User not found.' });
    }

    user.isMobileVerified = true;

    // Check if both email and mobile are verified
    if (user.isEmailVerified) {
      user.isVerified = true;
    }

    // Generate JWT token
    const token = generateToken(user);
    user.jwtToken = token; // Save the token in the user document

    await user.save();

    res.status(200).json({
      message: 'Mobile number verified successfully.',
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
});

// Route to post a job
router.post('/jobs', auth, async (req, res) => {
  const { jobTitle, jobDescription, experienceLevel, candidate, endDate } = req.body;
  try {
    const candidateEmails = candidate.split(',').map(email => email.trim()); // Split candidate emails by comma
    console.log('candidateEmails:', candidateEmails); // Debugging statement
    const job = new Job({
      jobTitle,
      jobDescription,
      experienceLevel,
      candidate: candidateEmails,
      candidateEmails,
      endDate,
      postedBy: req.user._id,
    });
    await job.save();

    // Send job alert email if candidateEmails is not empty
    if (candidateEmails.length > 0) {
      await sendJobAlertEmail(job, req.user);
    }

    res.status(201).json({ message: 'Job posted successfully! and email alerts sent', job });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
});

// Example protected route
router.get('/protected', auth, (req, res) => {
  res.status(200).json({ message: 'This is a protected route', user: req.user });
});

module.exports = router;