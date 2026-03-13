const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

initializeApp();

/**
 * Callable: deleteAuthUser
 * Deletes a Firebase Auth user by UID. Only callable by users with custom claim admin === true.
 * Used when an admin deletes a registration so the email can be used again for sign-up.
 */
exports.deleteAuthUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  const isAdmin = request.auth.token && request.auth.token.admin === true;
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only admins can delete user accounts.");
  }
  const uid = request.data && request.data.uid;
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid (string) is required.");
  }
  try {
    await getAuth().deleteUser(uid);
    return { success: true };
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      return { success: true };
    }
    throw new HttpsError("internal", err.message || "Failed to delete user.");
  }
});
