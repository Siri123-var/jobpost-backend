const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phoneNo: {
    type: String,
    required: true
  },
  companyName: {
    type: String,
    required: true
  },
  companyEmail: {
    type: String,
    required: true,
    unique: true
  },
  employeeSize: {
    type: Number,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isMobileVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationOTP: String,
  emailVerificationExpires: Date,
  mobileVerificationOTP: String,
  mobileVerificationExpires: Date,
  jwtToken: String // Add this field to store the JWT token
});

// Job Schema
const jobSchema = new mongoose.Schema({
  jobTitle: {
    type: String,
    required: true,
  },
  jobDescription: {
    type: String,
    required: true,
  },
  experienceLevel: {
    type: String,
    required: true,
  },
  candidate: {
    type: [String],
    required: true,
  },
  candidateEmails: {  
    type: [String],
    required: true,
  },
  
  endDate: {
    type: Date,
    required: true,
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

const User = mongoose.model('User', userSchema);
const Job = mongoose.model('Job', jobSchema);

module.exports = { User, Job };