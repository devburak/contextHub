// Minimum length for passwords set through registration, invitation acceptance,
// password reset and password change. Existing shorter passwords keep working
// at login; the rule applies when a password is set.
const PASSWORD_MIN_LENGTH = 8;

module.exports = { PASSWORD_MIN_LENGTH };
