import { firebaseConfig } from "./config.js";
import { loadDeletedIds, loadLocalData } from "./local-store.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const studentName = document.getElementById("student-name");
const studentCategory = document.getElementById("student-category");
const studentMeta = document.getElementById("student-meta");
const studentCover = document.getElementById("student-cover");
const gallery = document.getElementById("student-gallery");
const skeleton = document.getElementById("student-skeleton");
const emptyState = document.getElementById("student-empty");
const modal = document.getElementById("artwork-modal");
const modalBody = document.getElementById("artwork-modal-body");
const modalCloseButtons = document.querySelectorAll("[data-modal-close]");

let currentArtworks = [];
let interactionsReady = false;

function mergeWithLocal(remoteItems, localItems) {
  const merged = new Map();
  remoteItems.forEach(function (item) {
    if (item && item.id) {
      merged.set(item.id, item);
    }
  });
  localItems.forEach(function (item) {
    if (item && item.id && !merged.has(item.id)) {
      merged.set(item.id, item);
    }
  });
  return Array.from(merged.values());
}

const params = new URLSearchParams(window.location.search);
const studentId = params.get("id");

function setLoading(isLoading) {
  if (skeleton) {
    skeleton.style.display = isLoading ? "grid" : "none";
  }
  if (gallery) {
    gallery.style.display = isLoading ? "grid" : "none";
  }
}

function setEmpty(message) {
  if (emptyState) {
    emptyState.hidden = false;
    emptyState.textContent = message;
  }
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

function handleFirestoreError(error, localSnapshot) {
  if (localSnapshot && localSnapshot.localStudent) {
    return;
  }
  const code = error && error.code ? error.code : "";
  if (code === "permission-denied") {
    setEmpty(
      "لا توجد صلاحية لقراءة البيانات. يرجى تحديث قواعد Firestore أو تفعيل تسجيل الدخول المجهول."
    );
    return;
  }
  setEmpty("حدث خطأ أثناء جلب البيانات.");
}

function getVideoPoster(url) {
  if (!url || !url.includes("/video/upload/")) {
    return "";
  }
  return url.replace("/video/upload/", "/video/upload/so_0/");
}

function createMediaElement(artwork, variant) {
  const wrapper = document.createElement("div");
  wrapper.className = variant === "modal" ? "modal-media" : "artwork-media";

  const mediaType = artwork.mediaType || (artwork.videoUrl ? "video" : "image");
  if (mediaType === "video") {
    const videoUrl = artwork.videoUrl || artwork.mediaUrl;
    if (videoUrl) {
      const video = document.createElement("video");
      video.src = videoUrl;
      video.controls = variant === "modal";
      video.preload = "metadata";
      video.playsInline = true;
      if (variant !== "modal") {
        video.muted = true;
        const poster = getVideoPoster(videoUrl);
        if (poster) {
          video.poster = poster;
        }
      }
      wrapper.appendChild(video);
    }
    return wrapper;
  }

  const imageUrl = artwork.imageUrl || artwork.mediaUrl;
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = artwork.title || "عمل فني";
    img.loading = "lazy";
    img.decoding = "async";
    wrapper.appendChild(img);
  }
  return wrapper;
}

function openModal(artwork) {
  if (!modal || !modalBody) {
    return;
  }
  modalBody.innerHTML = "";

  const media = createMediaElement(artwork, "modal");
  const info = document.createElement("div");
  info.className = "modal-info";

  const title = document.createElement("h3");
  title.textContent = artwork.title || "عمل فني";
  const desc = document.createElement("p");
  desc.className = "muted";
  desc.textContent = artwork.description || "بدون وصف";
  const meta = document.createElement("span");
  meta.className = "muted";
  meta.textContent = artwork.type || "نوع غير محدد";

  info.appendChild(title);
  info.appendChild(desc);
  info.appendChild(meta);

  modalBody.appendChild(media);
  modalBody.appendChild(info);

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  if (!modal || !modalBody) {
    return;
  }
  const video = modalBody.querySelector("video");
  if (video) {
    video.pause();
    video.currentTime = 0;
  }
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function renderArtworks(artworks) {
  if (!gallery) {
    return;
  }
  gallery.innerHTML = "";
  if (artworks.length === 0) {
    setEmpty("لا توجد أعمال مضافة لهذه الطالبة بعد.");
    return;
  }

  artworks.forEach(function (art) {
    const card = document.createElement("div");
    card.className = "artwork-card";
    card.dataset.artId = art.id;

    const media = createMediaElement(art, "card");
    const body = document.createElement("div");
    body.className = "artwork-body";

    const title = document.createElement("div");
    title.className = "artwork-title";
    title.textContent = art.title || "عمل فني";

    const desc = document.createElement("div");
    desc.className = "artwork-meta";
    desc.textContent = art.description || "بدون وصف";

    const meta = document.createElement("div");
    meta.className = "artwork-meta";
    meta.textContent = art.type || "نوع غير محدد";

    body.appendChild(title);
    body.appendChild(desc);
    body.appendChild(meta);

    card.appendChild(media);
    card.appendChild(body);
    gallery.appendChild(card);
  });
}

function ensureInteractions() {
  if (interactionsReady) {
    return;
  }
  interactionsReady = true;

  if (gallery) {
    gallery.addEventListener("click", function (event) {
      const card = event.target.closest(".artwork-card");
      if (!card) {
        return;
      }
      const artId = card.dataset.artId;
      const artwork = currentArtworks.find(function (item) {
        return item.id === artId;
      });
      if (artwork) {
        openModal(artwork);
      }
    });
  }

  modalCloseButtons.forEach(function (button) {
    button.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

function applyStudentData(student, artworks) {
  if (studentName) {
    studentName.textContent = student.name || "طالبة";
  }
  if (student && student.name) {
    document.title = `${student.name} | مدرسة السلام الأساسية المختلطة`;
  }
  if (studentCategory) {
    studentCategory.textContent = student.category || "تصنيف غير محدد";
  }
  if (studentCover) {
    studentCover.src = student.coverUrl || "";
    studentCover.alt = student.name || "غلاف الطالبة";
  }

  artworks.sort(function (a, b) {
    const timeA =
      a.createdAt && a.createdAt.toMillis
        ? a.createdAt.toMillis()
        : Number(a.createdAt) || 0;
    const timeB =
      b.createdAt && b.createdAt.toMillis
        ? b.createdAt.toMillis()
        : Number(b.createdAt) || 0;
    return timeB - timeA;
  });

  if (studentMeta) {
    studentMeta.textContent = `عدد الأعمال: ${artworks.length}`;
  }

  currentArtworks = artworks;
  setLoading(false);
  renderArtworks(artworks);
  ensureInteractions();
}

function getLocalSnapshot() {
  const localData = loadLocalData();
  const deletedIds = loadDeletedIds();
  const isDeleted = deletedIds.students.includes(studentId);
  const localStudent = isDeleted
    ? null
    : localData.students.find(function (student) {
        return student.id === studentId;
      });
  const localArtworks = localData.artworks.filter(function (artwork) {
    return (
      artwork.studentId === studentId &&
      !deletedIds.artworks.includes(artwork.id)
    );
  });
  return { localStudent, localArtworks, deletedIds, isDeleted };
}

async function fetchStudentFromFirestore(db, localSnapshot) {
  try {
    const studentRef = doc(db, "students", studentId);
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) {
      if (!localSnapshot.localStudent) {
        setLoading(false);
        setEmpty("لم يتم العثور على الطالبة المطلوبة.");
      }
      return;
    }

    const student = studentSnap.data();
    const artQuery = query(
      collection(db, "artworks"),
      where("studentId", "==", studentId)
    );
    const artSnap = await getDocs(artQuery);
    const artworks = artSnap.docs.map(function (docItem) {
      return { id: docItem.id, ...docItem.data() };
    });
    const mergedArtworks = mergeWithLocal(
      artworks,
      localSnapshot.localArtworks
    ).filter(function (item) {
      return !localSnapshot.deletedIds.artworks.includes(item.id);
    });
    applyStudentData(student, mergedArtworks);
  } catch (error) {
    if (!localSnapshot.localStudent) {
      setLoading(false);
      handleFirestoreError(error, localSnapshot);
    }
  }
}

async function init() {
  if (!studentId) {
    setLoading(false);
    setEmpty("لم يتم اختيار طالبة لعرض أعمالها.");
    return;
  }

  const localSnapshot = getLocalSnapshot();
  if (localSnapshot.isDeleted) {
    setLoading(false);
    setEmpty("تم حذف الطالبة المطلوبة.");
    return;
  }
  if (localSnapshot.localStudent) {
    applyStudentData(localSnapshot.localStudent, localSnapshot.localArtworks);
  }

  window.addEventListener("storage", function (event) {
    if (event.key && !event.key.startsWith("btec_")) {
      return;
    }
    const snapshot = getLocalSnapshot();
    if (snapshot.isDeleted) {
      setLoading(false);
      setEmpty("تم حذف الطالبة المطلوبة.");
      return;
    }
    if (snapshot.localStudent) {
      applyStudentData(snapshot.localStudent, snapshot.localArtworks);
    }
  });

  if (!isFirebaseConfigured()) {
    if (!localSnapshot.localStudent) {
      setLoading(false);
      setEmpty("يرجى تحديث إعدادات Firebase في config.js");
    }
    return;
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  setLoading(true);

  fetchStudentFromFirestore(db, localSnapshot);
}

init();
