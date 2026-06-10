/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: [
    "goelo-auth.js",
    "goelo-ride-updates.js",
    "goelo-swipe-nav.js"
  ]
};
