const { Schema, model, models } = require('mongoose');
const {
  ROLES,
  COURSES,
  CLEARANCE_STATUSES,
  ELIGIBILITY,
  ACCOUNT_STATUSES,
  isValidQualificationYear,
} = require('./constants');

// One collection for students, invigilators and admins.
// Fields that only belong to one role are required for that role and left out for the others.
const isStudent = function () {
  return this.role === 'student';
};
const isInvigilator = function () {
  return this.role === 'invigilator';
};

const userSchema = new Schema(
  {
    role: { type: String, enum: ROLES, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    // Empty until the person finishes their first sign-in. Never returned by default.
    passwordHash: { type: String, default: null, select: false },
    accountStatus: { type: String, enum: ACCOUNT_STATUSES, default: 'invited' },
    lastLoginAt: { type: Date },

    // Students
    studentNumber: {
      type: String,
      trim: true,
      required: isStudent,
      match: [/^\d{9}$/, 'Student number must be exactly 9 digits'],
    },
    course: { type: String, enum: COURSES, required: isStudent },
    year: { type: Number, min: 1, max: 4, required: isStudent },
    clearanceStatus: {
      type: String,
      enum: CLEARANCE_STATUSES,
      default: function () {
        return this.role === 'student' ? 'cleared' : undefined;
      },
    },
    eligibility: { type: String, enum: ELIGIBILITY },
    eligibilityReason: { type: String, trim: true },
    eligibilityReviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    eligibilityReviewedAt: { type: Date },

    // Invigilators
    staffNumber: {
      type: String,
      trim: true,
      uppercase: true,
      required: isInvigilator,
      match: [/^INV-\d+$/, 'Staff number must look like INV-12345'],
    },
    department: { type: String, trim: true, required: isInvigilator },
    phone: { type: String, trim: true, required: isInvigilator },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// A new student starts as eligible only if their fees and documents are cleared.
// After that, an admin can change eligibility on its own (with a reason).
userSchema.pre('validate', function () {
  if (this.role === 'student' && !this.eligibility) {
    this.eligibility = this.clearanceStatus === 'cleared' ? 'eligible' : 'needs_review';
  }
  if (this.role === 'student' && !isValidQualificationYear(this.course, this.year)) {
    this.invalidate('year', 'Year is not valid for the selected qualification');
  }
});

// Student and staff numbers are unique, but only among people who have one
userSchema.index(
  { studentNumber: 1 },
  { unique: true, partialFilterExpression: { studentNumber: { $type: 'string' } } }
);
userSchema.index(
  { staffNumber: 1 },
  { unique: true, partialFilterExpression: { staffNumber: { $type: 'string' } } }
);
// Admin search and filters (status, course, year)
userSchema.index({ role: 1, course: 1, year: 1, eligibility: 1 });

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    delete ret.id;
    return ret;
  },
});

module.exports = models.User || model('User', userSchema);
