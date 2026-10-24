const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  jobTitle: String,
  description: String,
  salary: String,
  location: String,
  deadline: String,
  joiningDate: String,
  postedDate: String,
  applyLink: String,
  employerName: String,
  jobType: String
});

module.exports = mongoose.model('Job', jobSchema);
