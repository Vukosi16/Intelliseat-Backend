// Import models from here: const { User, Assessment } = require('../models');
const constants = require('./constants');

module.exports = {
  ...constants,
  User: require('./User'),
  AuthCode: require('./AuthCode'),
  Venue: require('./Venue'),
  Seat: require('./Seat'),
  Module: require('./Module'),
  Enrollment: require('./Enrollment'),
  Assessment: require('./Assessment'),
  SeatAllocation: require('./SeatAllocation'),
  QrToken: require('./QrToken'),
  SeatSwap: require('./SeatSwap'),
  Issue: require('./Issue'),
  IssueMessage: require('./IssueMessage'),
  Expulsion: require('./Expulsion'),
  Absence: require('./Absence'),
  PcStatusLog: require('./PcStatusLog'),
  Alert: require('./Alert'),
  AlertRead: require('./AlertRead'),
  AuditLog: require('./AuditLog'),
};
