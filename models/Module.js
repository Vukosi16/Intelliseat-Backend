const { Schema, model, models } = require('mongoose');
const { COURSES, isValidQualificationYear } = require('./constants');

const moduleSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true }, // ITSD200
    name: { type: String, required: true, trim: true }, // Systems Design
    course: { type: String, enum: COURSES, required: true },
    year: { type: Number, min: 1, max: 4, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

moduleSchema.pre('validate', function () {
  if (!isValidQualificationYear(this.course, this.year)) {
    this.invalidate('year', 'Year is not valid for the selected qualification');
  }
});

const Module = models.Module || model('Module', moduleSchema);
const coursePath = Module.schema.path('course');

coursePath.validators = coursePath.validators.filter((validator) => validator.type !== 'enum');
coursePath.enumValues = [];
coursePath.enum(...COURSES);

module.exports = Module;
