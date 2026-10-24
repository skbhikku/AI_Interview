const express = require("express");
const axios = require("axios");
const router = express.Router();
const Job = require("../models/Job");
require("dotenv").config();

const JSEARCH_API_KEY = process.env.RAPIDAPI_KEY;

router.post("/update", async (req, res) => {
  try {
    // Step 1: Delete all old jobs
    await Job.deleteMany();

    const headers = {
      'X-RapidAPI-Key': JSEARCH_API_KEY,
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
    };

    const queries = [
      'fresher IT full time jobs in India',
      'fresher IT internships in India',
      'startup fresher IT jobs in India',
      'startup IT internships in India',
      'top company fresher IT jobs in India',
      'top company IT internships in India'
    ];

    let allJobs = [];

    for (const query of queries) {
      const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
        headers,
        params: {
          query,
          page: '1',
          num_pages: '2'
        }
      });

      if (response.data && response.data.data) {
        allJobs = allJobs.concat(response.data.data);
      }
    }

    if (!allJobs.length) {
      return res.status(404).json({ message: "No jobs found from JSearch API." });
    }

    const formattedJobs = allJobs.map(job => ({
      jobTitle: job.job_title || "Untitled",
      description: job.job_description || "No description provided.",
      salary: job.job_salary || "Not specified",
      location: job.job_city || "India",
      deadline: job.job_offer_expiration_datetime_utc || "N/A",
      joiningDate: job.job_start_date || "N/A",
      postedDate: job.job_posted_at_datetime_utc || "N/A",
      applyLink: job.job_apply_link || "N/A",
      employerName: job.employer_name || "Unknown",
      jobType: job.job_employment_type || "Unknown"
    }));

    await Job.insertMany(formattedJobs);

    res.status(200).json({
      message: "Job data updated successfully.",
      totalSaved: formattedJobs.length
    });

  } catch (error) {
    console.error("❌ Error during job update:", error.message);
    res.status(500).json({
      message: "Failed to update job data.",
      error: error.message
    });
  }
});





module.exports = router;
