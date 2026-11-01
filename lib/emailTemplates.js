function inviteEmail({ firstName, code }) {
  return {
    subject: 'Your IntelliSeat verification code',
    text: `Hi ${firstName},

Your IntelliSeat account has been created.

Your verification code is: ${code}

Open the IntelliSeat app, tap "First time here?", enter your email address and this code, then choose a password.
The code expires in 7 days.

If you were not expecting this email, you can ignore it.`,
  };
}

function resetEmail({ firstName, code }) {
  return {
    subject: 'Your IntelliSeat password reset code',
    text: `Hi ${firstName},

We received a request to reset your IntelliSeat password.

Your verification code is:
${code}

The code expires in 15 minutes.

If you did not request this, you can ignore it.`,
  };
}

module.exports = { inviteEmail, resetEmail };
