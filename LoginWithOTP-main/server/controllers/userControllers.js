const users = require("../models/userSchema");
const userotp = require("../models/userOtp");
const nodemailer = require("nodemailer");
const moment = require("moment");

//email config
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

exports.userregister = async (req, res) => {
  const { fname, email, password } = req.body;

  if (!fname || !email || !password) {
    res.status(400).json({ error: "Please Enter All Input Data" });
  }

  try {
    const presuer = await users.findOne({ email: email });

    if (presuer) {
      res.status(400).json({ error: "This User Allready exist in our db" });
    } else {
      const userregister = new users({
        fname,
        email,
        password,
      });

      // here password hasing

      const storeData = await userregister.save();
      res.status(200).json(storeData);
    }
  } catch (error) {
    res.status(400).json({ error: "Invalid Details", error });
  }
};

//user send otp
exports.userOtpSend = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: "Please Enter Your Email" });
  }

  try {
    const presuer = await users.findOne({ email: email });

    if (presuer) {
      // Check if there is an existing OTP request within the last minute
      const lastOtpRequest = await userotp.findOne({
        email: email,
        createdAt: { $gte: moment().subtract(1, "minutes") },
      });

      if (lastOtpRequest) {
        res
          .status(400)
          .json({
            error:
              "Please wait for at least 1 minute before generating a new OTP",
          });
      } else {
        const OTP = Math.floor(100000 + Math.random() * 900000);

        const existEmail = await userotp.findOne({ email: email });

        if (existEmail) {
          const updateData = await userotp.findByIdAndUpdate(
            { _id: existEmail._id },
            { otp: OTP },
            { new: true }
          );

          await updateData.save();

          const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: "Sending Email for Otp Validation",
            text: `OTP:- ${OTP}`,
          };

          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.log("error", error);
              res.status(400).json({ error: "email not send" });
            } else {
              console.log("Email sent", info.response);
              res.status(200).json({ message: "Email sent Successfully" });
            }
          });
        } else {
          const saveOtpData = new userotp({
            email,
            otp: OTP,
          });

          await saveOtpData.save();
          const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: "Sending Email for Otp Validation",
            text: `OTP:- ${OTP}`,
          };

          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.log("error", error);
              res.status(400).json({ error: "email not send" });
            } else {
              console.log("Email sent", info.response);
              res.status(200).json({ message: "Email sent Successfully" });
            }
          });
        }
      }
    } else {
      res.status(400).json({ error: "This User Does Not Exist in our Db" });
    }
  } catch (error) {
    res.status(400).json({ error: "Invalid Details", error });
  }
};

exports.userLogin = async (req, res) => {
  const { email, otp } = req.body;

  if (!otp || !email) {
    return res.status(400).json({ error: "Please enter your OTP and email" });
  }

  try {
    const userOtpSchema = await userotp.findOne({ email: email });

    if (userOtpSchema) {
      if (userOtpSchema.otp === otp) {
        // Check if the OTP is still valid (within 5 minutes)
        const currentTime = moment();
        const otpGenerationTime = moment(userOtpSchema.createdAt);

        if (currentTime.diff(otpGenerationTime, "minutes") > 5) {
          return res
            .status(400)
            .json({ error: "OTP has expired. Please generate a new one." });
        } else if (
          userOtpSchema.used ||
          (!userOtpSchema.used && userOtpSchema.attempts == 0)
        ) {
          userOtpSchema.used = true;
          await userOtpSchema.save();

          const preuser = await users.findOne({ email: email });

          // Token generation
          const token = await preuser.generateAuthtoken();
          return res
            .status(200)
            .json({ message: "User login successful", userToken: token });
        } else {
          return res
            .status(400)
            .json({
              error: "OTP has already been used. Please generate a new one.",
            });
        }
      } else {
        // Increment the OTP verification attempts
        userOtpSchema.attempts += 1;

        // Check if the user has reached the maximum consecutive wrong attempts
        if (userOtpSchema.attempts >= 5) {
          userOtpSchema.blockedUntil = moment().add(1, "hour");
          userOtpSchema.attempts = 0;
        }

        await userOtpSchema.save();

        return res.status(400).json({ error: "Invalid OTP" });
      }
    } else {
      return res
        .status(400)
        .json({ error: "This user does not exist in our database" });
    }
  } catch (error) {
    return res.status(400).json({ error: "Invalid details", error });
  }
};
