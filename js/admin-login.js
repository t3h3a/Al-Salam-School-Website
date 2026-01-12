import { firebaseConfig, adminConfig } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const loginForm = document.getElementById("admin-login-form");
const adminMessage = document.getElementById("admin-message");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function configValid(value) {
  return value && !String(value).includes("ضعه هنا");
}

function isFirebaseConfigured() {
  return (
    firebaseConfig &&
    configValid(firebaseConfig.apiKey) &&
    configValid(firebaseConfig.projectId)
  );
}

function setMessage(text) {
  if (adminMessage) {
    adminMessage.textContent = text || "";
  }
}

function init() {
  if (!isFirebaseConfigured()) {
    setMessage("يرجى تحديث إعدادات Firebase في config.js");
    return;
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  onAuthStateChanged(auth, function (user) {
    const configuredEmail = normalize(adminConfig && adminConfig.adminEmail);
    const isAuthorized =
      !configuredEmail ||
      (user && normalize(user.email) === configuredEmail);

    if (user && isAuthorized) {
      window.location.replace("admin.html");
      return;
    }

    if (user && !isAuthorized) {
      setMessage("لا تملكين صلاحية الوصول.");
      signOut(auth);
    }
  });

  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const email = String(formData.get("email") || "");
      const password = String(formData.get("password") || "");
      setMessage("جاري تسجيل الدخول...");
      signInWithEmailAndPassword(auth, email, password)
        .then(function () {
          setMessage("");
          window.location.replace("admin.html");
        })
        .catch(function (error) {
          const code = error && error.code ? error.code : "";
          const messages = {
            "auth/invalid-email": "البريد الإلكتروني غير صالح.",
            "auth/user-not-found": "الحساب غير موجود.",
            "auth/wrong-password": "كلمة المرور غير صحيحة.",
            "auth/invalid-credential": "بيانات الدخول غير صحيحة.",
            "auth/unauthorized-domain":
              "هذا الدومين غير مصرح به في Firebase.",
            "auth/network-request-failed":
              "مشكلة اتصال بالشبكة. حاولي مرة أخرى.",
            "auth/too-many-requests":
              "محاولات كثيرة. انتظري قليلاً ثم أعيدي المحاولة.",
          };
          setMessage(messages[code] || "تعذر تسجيل الدخول.");
        });
    });
  }
}

init();
