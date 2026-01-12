import { firebaseConfig, cloudinaryConfig, adminConfig } from "./config.js";
import {
  addLocalArtwork,
  addLocalStudent,
  clearArtworkDeleted,
  clearStudentDeleted,
  loadDeletedIds,
  loadLocalData,
  markArtworkDeleted,
  markStudentDeleted,
  removeLocalArtwork,
  removeLocalStudent,
  saveLocalArtworks,
  saveLocalStudents,
  updateLocalStudent,
} from "./local-store.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const adminShell = document.querySelector("[data-admin-shell]");
const adminPanel = document.querySelector("[data-admin-panel]");
const logoutButton = document.getElementById("admin-logout");
const addStudentForm = document.getElementById("add-student-form");
const addArtworkForm = document.getElementById("add-artwork-form");
const adminStudents = document.getElementById("admin-students");
const studentSelect = document.getElementById("artwork-student");
const artworkCards = document.getElementById("artworkCards");
const addArtworkCardButton = document.getElementById("add-artwork-card");
const toast = document.getElementById("toast");

let students = [];
let artworks = [];
let isAdmin = false;
let bootstrapped = false;
let isSyncingLocal = false;
let studentsRef = null;
let artworksRef = null;

function showToast(message, type) {
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.classList.remove("error");
  if (type === "error") {
    toast.classList.add("error");
  }
  toast.classList.add("show");
  setTimeout(function () {
    toast.classList.remove("show");
  }, 2800);
}

function updateProgress(type, percent, message) {
  const bar = document.querySelector(`[data-progress="${type}"] span`);
  const text = document.querySelector(`[data-progress-text="${type}"]`);
  if (bar) {
    bar.style.width = `${percent}%`;
  }
  if (text) {
    text.textContent = message || "";
  }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, function (char) {
    return (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[char] || char
    );
  });
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

function isCloudinaryConfigured() {
  return (
    cloudinaryConfig &&
    configValid(cloudinaryConfig.cloudName) &&
    configValid(cloudinaryConfig.uploadPreset)
  );
}

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function updateLocalArtwork(artworkId, updates) {
  if (!artworkId) {
    return [];
  }
  const localData = loadLocalData();
  const next = localData.artworks.map(function (art) {
    if (art.id !== artworkId) {
      return art;
    }
    const nextLocalOnly =
      typeof updates.localOnly === "boolean" ? updates.localOnly : art.localOnly;
    return {
      ...art,
      ...updates,
      id: art.id,
      createdAt: art.createdAt,
      localOnly: Boolean(nextLocalOnly),
    };
  });
  saveLocalArtworks(next);
  return next;
}

async function uploadToCloudinary(file, onProgress, resourceType) {
  if (!isCloudinaryConfigured()) {
    throw new Error("يرجى تحديث إعدادات Cloudinary في config.js");
  }
  const type = resourceType || "image";
  const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${type}/upload`;
  return new Promise(function (resolve, reject) {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", cloudinaryConfig.uploadPreset);
    if (cloudinaryConfig.folder) {
      formData.append("folder", cloudinaryConfig.folder);
    }

    xhr.upload.onprogress = function (event) {
      if (event.lengthComputable && typeof onProgress === "function") {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error("فشل رفع الصورة إلى Cloudinary"));
        }
      }
    };

    xhr.onerror = function () {
      reject(new Error("تعذر الاتصال بـ Cloudinary"));
    };

    xhr.open("POST", url, true);
    xhr.send(formData);
  });
}

async function syncLocalStudents() {
  const localData = loadLocalData();
  const localStudents = localData.students.filter(function (student) {
    return student.localOnly;
  });
  if (!localStudents.length) {
    return { synced: 0, failed: 0 };
  }

  const needsUpload = localStudents.some(function (student) {
    return isDataUrl(student.coverUrl);
  });
  if (needsUpload && !isCloudinaryConfigured()) {
    showToast("يرجى تحديث إعدادات Cloudinary حتى تتم المزامنة.", "error");
    return { synced: 0, failed: localStudents.length };
  }

  let synced = 0;
  for (let index = 0; index < localStudents.length; index += 1) {
    const student = localStudents[index];
    try {
      let coverUrl = student.coverUrl || "";
      if (isDataUrl(coverUrl)) {
        const upload = await uploadToCloudinary(coverUrl, null, "image");
        coverUrl = upload.secure_url;
      }
      await setDoc(doc(studentsRef, student.id), {
        name: student.name || "",
        category: student.category || "",
        coverUrl: coverUrl,
        createdAt: student.createdAt || Date.now(),
      });
      updateLocalStudent(student.id, {
        coverUrl: coverUrl,
        localOnly: false,
      });
      synced += 1;
    } catch (error) {
      // Keep local data for retry.
    }
  }

  return { synced: synced, failed: localStudents.length - synced };
}

async function syncLocalArtworks() {
  const localData = loadLocalData();
  const localArtworks = localData.artworks.filter(function (artwork) {
    return artwork.localOnly;
  });
  if (!localArtworks.length) {
    return { synced: 0, failed: 0 };
  }

  const blockedStudentIds = new Set(
    localData.students
      .filter(function (student) {
        return student.localOnly;
      })
      .map(function (student) {
        return student.id;
      })
  );

  const needsUpload = localArtworks.some(function (artwork) {
    const mediaType = artwork.mediaType || (artwork.videoUrl ? "video" : "image");
    const mediaUrl = mediaType === "video" ? artwork.videoUrl : artwork.imageUrl;
    return isDataUrl(mediaUrl);
  });
  if (needsUpload && !isCloudinaryConfigured()) {
    showToast("يرجى تحديث إعدادات Cloudinary حتى تتم المزامنة.", "error");
    return { synced: 0, failed: localArtworks.length };
  }

  let synced = 0;
  for (let index = 0; index < localArtworks.length; index += 1) {
    const artwork = localArtworks[index];
    if (!artwork.studentId || blockedStudentIds.has(artwork.studentId)) {
      continue;
    }

    const mediaType = artwork.mediaType || (artwork.videoUrl ? "video" : "image");
    const isVideo = mediaType === "video";
    const mediaUrl = isVideo ? artwork.videoUrl : artwork.imageUrl;
    if (!mediaUrl) {
      continue;
    }

    try {
      let finalUrl = mediaUrl;
      if (isDataUrl(mediaUrl)) {
        const upload = await uploadToCloudinary(
          mediaUrl,
          null,
          isVideo ? "video" : "image"
        );
        finalUrl = upload.secure_url;
      }

      const payload = {
        studentId: artwork.studentId,
        type: artwork.type || "",
        title: artwork.title || "عمل فني",
        description: artwork.description || "",
        mediaType: mediaType,
        createdAt: artwork.createdAt || Date.now(),
      };
      if (isVideo) {
        payload.videoUrl = finalUrl;
      } else {
        payload.imageUrl = finalUrl;
      }

      await setDoc(doc(artworksRef, artwork.id), payload);
      const updates = { localOnly: false, mediaType: mediaType };
      if (isVideo) {
        updates.videoUrl = finalUrl;
      } else {
        updates.imageUrl = finalUrl;
      }
      updateLocalArtwork(artwork.id, updates);
      synced += 1;
    } catch (error) {
      // Keep local data for retry.
    }
  }

  return { synced: synced, failed: localArtworks.length - synced };
}

async function syncLocalQueue() {
  if (isSyncingLocal || !studentsRef || !artworksRef) {
    return;
  }
  const localData = loadLocalData();
  const hasLocalStudents = localData.students.some(function (student) {
    return student.localOnly;
  });
  const hasLocalArtworks = localData.artworks.some(function (artwork) {
    return artwork.localOnly;
  });
  if (!hasLocalStudents && !hasLocalArtworks) {
    return;
  }

  isSyncingLocal = true;
  showToast("جاري مزامنة العناصر المحفوظة محليًا...");
  const studentResult = await syncLocalStudents();
  const artworkResult = await syncLocalArtworks();
  const totalSynced = studentResult.synced + artworkResult.synced;
  const totalFailed = studentResult.failed + artworkResult.failed;

  const updated = loadLocalData();
  students = updated.students;
  artworks = updated.artworks;
  renderStudentOptions();
  renderAdminStudents();

  if (totalSynced > 0 && totalFailed === 0) {
    showToast("تمت مزامنة العناصر إلى السحابة بنجاح.");
  } else if (totalSynced > 0) {
    showToast("تمت مزامنة بعض العناصر والباقي يحتاج اتصالاً.", "error");
  } else if (totalFailed > 0) {
    showToast("تعذر مزامنة العناصر المحفوظة محليًا.", "error");
  }
  isSyncingLocal = false;
}

function getArtworkCards() {
  if (!artworkCards) {
    return [];
  }
  return Array.from(artworkCards.querySelectorAll("[data-artwork-card]"));
}

function clearPreview(card) {
  const preview = card.querySelector("[data-artwork-preview]");
  if (!preview) {
    return;
  }
  const storedUrl = preview.dataset.previewUrl;
  if (storedUrl) {
    URL.revokeObjectURL(storedUrl);
    delete preview.dataset.previewUrl;
  }
  preview.classList.remove("has-media");
  preview.innerHTML = "<span>المعاينة ستظهر هنا</span>";
}

function setPreview(card, file, mediaType) {
  const preview = card.querySelector("[data-artwork-preview]");
  if (!preview || !file) {
    return;
  }
  const storedUrl = preview.dataset.previewUrl;
  if (storedUrl) {
    URL.revokeObjectURL(storedUrl);
  }
  const url = URL.createObjectURL(file);
  preview.dataset.previewUrl = url;
  preview.classList.add("has-media");
  preview.innerHTML = "";
  if (mediaType === "video") {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.autoplay = true;
    preview.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "معاينة";
    preview.appendChild(img);
  }
}

function toggleCardMediaFields(card) {
  const typeSelect = card.querySelector('[data-field="mediaType"]');
  const mediaType = typeSelect ? typeSelect.value : "image";
  const imageField = card.querySelector('[data-media-field="image"]');
  const videoField = card.querySelector('[data-media-field="video"]');
  if (imageField) {
    imageField.hidden = mediaType === "video";
  }
  if (videoField) {
    videoField.hidden = mediaType !== "video";
  }
}

function resetArtworkCard(card) {
  card.querySelectorAll("input, textarea, select").forEach(function (el) {
    if (el.type === "file") {
      el.value = "";
    } else if (el.tagName === "SELECT") {
      el.value = "image";
    } else {
      el.value = "";
    }
  });
  toggleCardMediaFields(card);
  clearPreview(card);
}

function updateCardRemoveButtons() {
  const cards = getArtworkCards();
  cards.forEach(function (card) {
    const removeBtn = card.querySelector("[data-remove-card]");
    if (removeBtn) {
      const single = cards.length === 1;
      removeBtn.disabled = single;
      removeBtn.style.display = single ? "none" : "inline-flex";
    }
  });
}

function setupArtworkCard(card) {
  if (!card) {
    return;
  }
  const typeSelect = card.querySelector('[data-field="mediaType"]');
  const imageInput = card.querySelector('[data-field="imageFile"]');
  const videoInput = card.querySelector('[data-field="videoFile"]');
  const removeBtn = card.querySelector("[data-remove-card]");

  if (typeSelect) {
    typeSelect.addEventListener("change", function () {
      toggleCardMediaFields(card);
      if (imageInput) {
        imageInput.value = "";
      }
      if (videoInput) {
        videoInput.value = "";
      }
      clearPreview(card);
    });
  }

  if (imageInput) {
    imageInput.addEventListener("change", function () {
      const file = imageInput.files && imageInput.files[0];
      if (file) {
        setPreview(card, file, "image");
      } else {
        clearPreview(card);
      }
    });
  }

  if (videoInput) {
    videoInput.addEventListener("change", function () {
      const file = videoInput.files && videoInput.files[0];
      if (file) {
        setPreview(card, file, "video");
      } else {
        clearPreview(card);
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", function () {
      const cards = getArtworkCards();
      if (cards.length === 1) {
        return;
      }
      const preview = card.querySelector("[data-artwork-preview]");
      if (preview && preview.dataset.previewUrl) {
        URL.revokeObjectURL(preview.dataset.previewUrl);
      }
      card.remove();
      updateCardRemoveButtons();
    });
  }

  toggleCardMediaFields(card);
  clearPreview(card);
}

function setupArtworkCards() {
  if (!artworkCards) {
    return;
  }
  getArtworkCards().forEach(setupArtworkCard);
  updateCardRemoveButtons();
}

function addArtworkCard() {
  if (!artworkCards) {
    return;
  }
  const template = artworkCards.querySelector("[data-artwork-card]");
  if (!template) {
    return;
  }
  const clone = template.cloneNode(true);
  resetArtworkCard(clone);
  artworkCards.appendChild(clone);
  setupArtworkCard(clone);
  updateCardRemoveButtons();
}

function fileToDataUrl(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = function () {
      reject(new Error("تعذر قراءة الملف محليًا"));
    };
    reader.readAsDataURL(file);
  });
}

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

function getCreatedAtValue(value) {
  if (!value) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  return 0;
}

function renderStudentOptions() {
  if (!studentSelect) {
    return;
  }
  studentSelect.innerHTML = "";
  if (students.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "لا توجد طالبات بعد";
    option.disabled = true;
    option.selected = true;
    studentSelect.appendChild(option);
    return;
  }
  students.forEach(function (student) {
    const option = document.createElement("option");
    option.value = student.id;
    option.textContent = student.name;
    studentSelect.appendChild(option);
  });
}

function renderAdminStudents() {
  if (!adminStudents) {
    return;
  }
  adminStudents.innerHTML = "";

  if (students.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "لا توجد طالبات حالياً.";
    adminStudents.appendChild(empty);
    return;
  }

  students.forEach(function (student) {
    const card = document.createElement("div");
    card.className = "admin-student-card";

    const header = document.createElement("div");
    header.className = "admin-student-header";

    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = student.name;
    const meta = document.createElement("div");
    meta.className = "muted";
    const count = artworks.filter(function (art) {
      return art.studentId === student.id;
    }).length;
    meta.textContent = `${student.category || "مختلط"} • ${count} أعمال`;
    info.appendChild(name);
    info.appendChild(meta);

    const cover = document.createElement("img");
    cover.src = student.coverUrl;
    cover.alt = student.name;
    cover.className = "admin-student-cover";

    header.appendChild(info);
    header.appendChild(cover);

    const actions = document.createElement("div");
    actions.className = "admin-actions";

    const viewLink = document.createElement("a");
    viewLink.className = "btn ghost";
    viewLink.href = `student.html?id=${encodeURIComponent(student.id)}`;
    viewLink.textContent = "عرض الصفحة";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn outline";
    deleteBtn.type = "button";
    deleteBtn.textContent = "حذف الطالبة";
    deleteBtn.dataset.deleteStudent = student.id;

    actions.appendChild(viewLink);
    actions.appendChild(deleteBtn);

    const editDetails = document.createElement("details");
    editDetails.className = "admin-edit";
    const editSummary = document.createElement("summary");
    editSummary.textContent = "تعديل البيانات";
    editDetails.appendChild(editSummary);

    const editForm = document.createElement("form");
    editForm.className = "admin-form";
    editForm.dataset.editStudentForm = "true";
    editForm.dataset.studentId = student.id;

    editForm.innerHTML = `
      <div class="form-group">
        <label>اسم الطالبة</label>
        <input class="input" type="text" name="name" value="${escapeHtml(
          student.name
        )}" required />
      </div>
      <div class="form-group">
        <label>تصنيف الطالبة</label>
        <input class="input" type="text" name="category" value="${escapeHtml(
          student.category || ""
        )}" required />
      </div>
      <div class="form-group">
        <label>تحديث صورة الغلاف (اختياري)</label>
        <input class="input" type="file" name="cover" accept="image/*" />
      </div>
      <button class="btn primary" type="submit">حفظ التعديلات</button>
    `;

    editDetails.appendChild(editForm);

    const artworksDetails = document.createElement("details");
    artworksDetails.className = "admin-artworks";
    const artworksSummary = document.createElement("summary");
    artworksSummary.textContent = "إدارة الأعمال";
    artworksDetails.appendChild(artworksSummary);

    const list = document.createElement("div");
    list.className = "artworks-list";

    const studentArtworks = artworks.filter(function (art) {
      return art.studentId === student.id;
    });

    if (studentArtworks.length === 0) {
      const empty = document.createElement("span");
      empty.className = "muted";
      empty.textContent = "لا توجد أعمال مضافة.";
      list.appendChild(empty);
    } else {
      studentArtworks.forEach(function (art) {
        const item = document.createElement("div");
        item.className = "artwork-item";
        const title = document.createElement("strong");
        title.textContent = art.title || "عمل فني";
        const metaText = document.createElement("span");
        metaText.textContent = `${art.type || "نوع غير محدد"} • ${
          art.mediaType === "video" || art.videoUrl ? "فيديو" : "صورة"
        }`;

        const del = document.createElement("button");
        del.className = "btn outline";
        del.type = "button";
        del.textContent = "حذف";
        del.dataset.deleteArtwork = art.id;

        item.appendChild(title);
        item.appendChild(metaText);
        item.appendChild(del);
        list.appendChild(item);
      });
    }

    artworksDetails.appendChild(list);

    card.appendChild(header);
    card.appendChild(actions);
    card.appendChild(editDetails);
    card.appendChild(artworksDetails);
    adminStudents.appendChild(card);
  });
}

async function deleteStudent(studentId, db) {
  const confirmDelete = window.confirm(
    "هل أنت متأكدة من حذف الطالبة وكل أعمالها؟"
  );
  if (!confirmDelete) {
    return;
  }
  try {
    markStudentDeleted(studentId);
  } catch (error) {
    // Ignore local storage errors and continue with in-memory removal.
  }
  let nextStudents = students.filter(function (item) {
    return item.id !== studentId;
  });
  let nextArtworks = artworks.filter(function (item) {
    return item.studentId !== studentId;
  });
  try {
    const removed = removeLocalStudent(studentId);
    if (removed && removed.students && removed.artworks) {
      nextStudents = removed.students;
      nextArtworks = removed.artworks;
    } else {
      saveLocalStudents(nextStudents);
      saveLocalArtworks(nextArtworks);
    }
  } catch (error) {
    try {
      saveLocalStudents(nextStudents);
      saveLocalArtworks(nextArtworks);
    } catch (innerError) {
      // Ignore storage errors; UI will still update.
    }
  }
  students = nextStudents;
  artworks = nextArtworks;
  renderStudentOptions();
  renderAdminStudents();
  try {
    const artQuery = query(
      collection(db, "artworks"),
      where("studentId", "==", studentId)
    );
    const artSnap = await getDocs(artQuery);
    const deletes = artSnap.docs.map(function (item) {
      return deleteDoc(item.ref);
    });
    await Promise.all(deletes);
    await deleteDoc(doc(db, "students", studentId));
    clearStudentDeleted(studentId);
    showToast("تم حذف الطالبة والأعمال المرتبطة بها");
  } catch (error) {
    showToast("تم الحذف محليًا وسيتم إخفاؤه من العرض", "error");
  }
}

async function deleteArtwork(artworkId, db) {
  const confirmDelete = window.confirm("هل أنت متأكدة من حذف العمل؟");
  if (!confirmDelete) {
    return;
  }
  try {
    markArtworkDeleted(artworkId);
  } catch (error) {
    // Ignore local storage errors and continue with in-memory removal.
  }
  let nextArtworks = artworks.filter(function (item) {
    return item.id !== artworkId;
  });
  try {
    const removed = removeLocalArtwork(artworkId);
    if (removed) {
      nextArtworks = removed;
    } else {
      saveLocalArtworks(nextArtworks);
    }
  } catch (error) {
    try {
      saveLocalArtworks(nextArtworks);
    } catch (innerError) {
      // Ignore storage errors; UI will still update.
    }
  }
  artworks = nextArtworks;
  renderAdminStudents();
  try {
    await deleteDoc(doc(db, "artworks", artworkId));
    clearArtworkDeleted(artworkId);
    showToast("تم حذف العمل");
  } catch (error) {
    showToast("تم حذف العمل محليًا وسيختفي من العرض", "error");
  }
}

function init() {
  if (!isFirebaseConfigured()) {
    showToast("يرجى تحديث إعدادات Firebase في config.js", "error");
    return;
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (logoutButton) {
    logoutButton.addEventListener("click", function () {
      signOut(auth)
        .then(function () {
          window.location.replace("admin-login.html");
        })
        .catch(function () {
          showToast("تعذر تسجيل الخروج", "error");
        });
    });
  }

  if (addStudentForm) {
    addStudentForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!isAdmin) {
        showToast("لا تملكين صلاحية الإضافة", "error");
        return;
      }
      if (!studentsRef) {
        showToast("جاري تهيئة البيانات، حاولي مرة أخرى.", "error");
        return;
      }
      const formData = new FormData(addStudentForm);
      const name = String(formData.get("name") || "");
      const category = String(formData.get("category") || "");
      const coverFile = formData.get("cover");

      if (!coverFile || coverFile.size === 0) {
        showToast("يرجى اختيار صورة غلاف", "error");
        return;
      }

      updateProgress("student", 0, "جاري رفع صورة الغلاف...");
      let coverUrl = "";
      uploadToCloudinary(coverFile, function (p) {
        updateProgress("student", p, "جاري رفع صورة الغلاف...");
      })
        .then(function (upload) {
          coverUrl = upload.secure_url;
          return addDoc(studentsRef, {
            name,
            category,
            coverUrl: coverUrl,
            createdAt: serverTimestamp(),
          });
        })
        .then(function (docRef) {
          if (docRef && docRef.id) {
            students.unshift({
              id: docRef.id,
              name,
              category,
              coverUrl: coverUrl,
              createdAt: Date.now(),
            });
            saveLocalStudents(students);
            renderStudentOptions();
            renderAdminStudents();
          }
          addStudentForm.reset();
          updateProgress("student", 0, "");
          showToast("تمت إضافة الطالبة بنجاح");
        })
        .catch(function (error) {
          Promise.resolve()
            .then(function () {
              return fileToDataUrl(coverFile);
            })
            .then(function (dataUrl) {
              const localStudent = addLocalStudent({
                name,
                category,
                coverUrl: dataUrl,
                createdAt: Date.now(),
                localOnly: true,
              });
              students.unshift(localStudent);
              saveLocalStudents(students);
              renderStudentOptions();
              renderAdminStudents();
              addStudentForm.reset();
              updateProgress("student", 0, "");
              showToast(
                "تم حفظ الطالبة محليًا وسيتم نشرها عند توفر الاتصال.",
                "error"
              );
            })
            .catch(function () {
              updateProgress("student", 0, "");
              showToast(error.message || "تعذر إضافة الطالبة", "error");
            });
        });
    });
  }

  if (addArtworkForm) {
    addArtworkForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!isAdmin) {
        showToast("لا تملكين صلاحية الإضافة", "error");
        return;
      }
      if (!artworksRef) {
        showToast("جاري تهيئة البيانات، حاولي مرة أخرى.", "error");
        return;
      }
      updateProgress("artwork", 0, "");
      const formData = new FormData(addArtworkForm);
      const studentId = String(formData.get("studentId") || "");

      if (!studentId) {
        showToast("يرجى إضافة طالبة أولاً", "error");
        return;
      }

      const cards = getArtworkCards();
      const entries = [];
      let invalid = false;

      cards.forEach(function (card) {
        const mediaType = String(
          card.querySelector('[data-field="mediaType"]')?.value || "image"
        );
        const type = String(
          card.querySelector('[data-field="type"]')?.value || ""
        ).trim();
        const title = String(
          card.querySelector('[data-field="title"]')?.value || ""
        ).trim();
        const description = String(
          card.querySelector('[data-field="description"]')?.value || ""
        ).trim();
        const fileInput =
          mediaType === "video"
            ? card.querySelector('[data-field="videoFile"]')
            : card.querySelector('[data-field="imageFile"]');
        const file = fileInput && fileInput.files ? fileInput.files[0] : null;
        const hasAny = type || title || description || file;

        if (!hasAny) {
          return;
        }
        if (!type || !file) {
          invalid = true;
          return;
        }
        entries.push({
          mediaType,
          type,
          title,
          description,
          file,
        });
      });

      if (invalid) {
        showToast("يرجى تعبئة نوع العمل وإرفاق ملف لكل بطاقة.", "error");
        return;
      }
      if (entries.length === 0) {
        showToast("أضيفي بطاقة واحدة على الأقل قبل الحفظ.", "error");
        return;
      }

      const total = entries.length;
      let remoteCount = 0;
      let localCount = 0;

      (async function () {
        for (let index = 0; index < entries.length; index += 1) {
          const entry = entries[index];
          const progressLabel = `رفع البطاقة ${index + 1} من ${total}`;
          try {
            const upload = await uploadToCloudinary(
              entry.file,
              function (p) {
                const percent = Math.round(((index + p / 100) / total) * 100);
                updateProgress("artwork", percent, progressLabel);
              },
              entry.mediaType === "video" ? "video" : "image"
            );
            const finalTitle =
              entry.title ||
              entry.file.name.replace(/\.[^/.]+$/, "") ||
              "عمل فني";
            const payload = {
              studentId,
              type: entry.type,
              title: finalTitle,
              description: entry.description,
              mediaType: entry.mediaType,
              createdAt: serverTimestamp(),
            };
            if (entry.mediaType === "image") {
              payload.imageUrl = upload.secure_url;
            }
            if (entry.mediaType === "video") {
              payload.videoUrl = upload.secure_url;
            }
            const docRef = await addDoc(artworksRef, payload);
            if (docRef && docRef.id) {
              const newArtwork = {
                id: docRef.id,
                studentId,
                type: entry.type,
                title: finalTitle,
                description: entry.description,
                mediaType: entry.mediaType,
                createdAt: Date.now(),
              };
              if (entry.mediaType === "image") {
                newArtwork.imageUrl = upload.secure_url;
              }
              if (entry.mediaType === "video") {
                newArtwork.videoUrl = upload.secure_url;
              }
              artworks.unshift(newArtwork);
            }
            remoteCount += 1;
          } catch (error) {
            const dataUrl = await fileToDataUrl(entry.file);
            const localPayload = {
              studentId,
              type: entry.type,
              title: entry.title || entry.file.name.replace(/\.[^/.]+$/, ""),
              description: entry.description,
              mediaType: entry.mediaType,
              createdAt: Date.now(),
              localOnly: true,
            };
            if (entry.mediaType === "image") {
              localPayload.imageUrl = dataUrl;
            }
            if (entry.mediaType === "video") {
              localPayload.videoUrl = dataUrl;
            }
            const localArtwork = addLocalArtwork(localPayload);
            artworks.unshift(localArtwork);
            localCount += 1;
          }
        }
      })()
        .then(function () {
          addArtworkForm.reset();
          const cardsAfter = getArtworkCards();
          cardsAfter.slice(1).forEach(function (card) {
            clearPreview(card);
            card.remove();
          });
          const firstCard = cardsAfter[0];
          if (firstCard) {
            resetArtworkCard(firstCard);
          }
          updateCardRemoveButtons();
          updateProgress("artwork", 0, "");
          if (localCount > 0 && remoteCount === 0) {
            showToast(
              "تم حفظ الأعمال محليًا وسيتم نشرها عند توفر الاتصال.",
              "error"
            );
          } else if (localCount > 0) {
            showToast(
              "تم حفظ بعض الأعمال محليًا وسيتم نشرها عند توفر الاتصال.",
              "error"
            );
          } else {
            showToast("تمت إضافة الأعمال بنجاح");
          }
          saveLocalArtworks(artworks);
          renderAdminStudents();
        })
        .catch(function (error) {
          updateProgress("artwork", 0, "");
          showToast(error.message || "تعذر إضافة الأعمال", "error");
        });
    });
  }

  onAuthStateChanged(auth, function (user) {
    const configuredEmail = normalize(adminConfig && adminConfig.adminEmail);
    const isAuthorized =
      !configuredEmail ||
      (user && normalize(user.email) === configuredEmail);

    if (!user || !isAuthorized) {
      if (user && !isAuthorized) {
        showToast("لا تملكين صلاحية الوصول", "error");
        signOut(auth);
      }
      window.location.replace("admin-login.html");
      return;
    }

    isAdmin = true;
    if (adminShell) {
      adminShell.hidden = false;
    }
    if (adminPanel) {
      adminPanel.hidden = false;
    }
    const localData = loadLocalData();
    const deletedIds = loadDeletedIds();
    if (localData.students.length || localData.artworks.length) {
      students = localData.students.filter(function (item) {
        return !deletedIds.students.includes(item.id);
      });
      artworks = localData.artworks.filter(function (item) {
        return !deletedIds.artworks.includes(item.id);
      });
      renderStudentOptions();
      renderAdminStudents();
    }

    if (!bootstrapped) {
      bootstrapped = true;
      studentsRef = collection(db, "students");
      artworksRef = collection(db, "artworks");

      onSnapshot(query(studentsRef, orderBy("createdAt", "desc")), function (
        snap
      ) {
        const remoteStudents = snap.docs.map(function (docItem) {
          return { id: docItem.id, ...docItem.data() };
        });
        const stored = loadLocalData();
        const deleted = loadDeletedIds();
        students = mergeWithLocal(remoteStudents, stored.students).filter(
          function (item) {
            return !deleted.students.includes(item.id);
          }
        );
        students.sort(function (a, b) {
          return getCreatedAtValue(b.createdAt) - getCreatedAtValue(a.createdAt);
        });
        saveLocalStudents(students);
        renderStudentOptions();
        renderAdminStudents();
      });

      onSnapshot(query(artworksRef, orderBy("createdAt", "desc")), function (
        snap
      ) {
        const remoteArtworks = snap.docs.map(function (docItem) {
          return { id: docItem.id, ...docItem.data() };
        });
        const stored = loadLocalData();
        const deleted = loadDeletedIds();
        artworks = mergeWithLocal(remoteArtworks, stored.artworks).filter(
          function (item) {
            return !deleted.artworks.includes(item.id);
          }
        );
        artworks.sort(function (a, b) {
          return getCreatedAtValue(b.createdAt) - getCreatedAtValue(a.createdAt);
        });
        saveLocalArtworks(artworks);
        renderAdminStudents();
      });

      syncLocalQueue();
      window.addEventListener("online", function () {
        syncLocalQueue();
      });

      setupArtworkCards();
      if (addArtworkCardButton) {
        addArtworkCardButton.addEventListener("click", addArtworkCard);
      }

      if (adminStudents) {
        adminStudents.addEventListener("click", function (event) {
          const deleteBtn = event.target.closest("[data-delete-student]");
          if (deleteBtn) {
            deleteStudent(deleteBtn.dataset.deleteStudent, db).catch(function (
              err
            ) {
              showToast(err.message || "تعذر حذف الطالبة", "error");
            });
          }
          const deleteArt = event.target.closest("[data-delete-artwork]");
          if (deleteArt) {
            deleteArtwork(deleteArt.dataset.deleteArtwork, db).catch(function (
              err
            ) {
              showToast(err.message || "تعذر حذف العمل", "error");
            });
          }
        });

        adminStudents.addEventListener("submit", function (event) {
          const form = event.target;
          if (!form.dataset.editStudentForm) {
            return;
          }
          event.preventDefault();
          if (!isAdmin) {
            showToast("لا تملكين صلاحية التعديل", "error");
            return;
          }
          const studentId = form.dataset.studentId;
          const formData = new FormData(form);
          const name = formData.get("name");
          const category = formData.get("category");
          const coverFile = formData.get("cover");
          const currentStudent = students.find(function (item) {
            return item.id === studentId;
          });
          if (currentStudent && currentStudent.localOnly) {
            Promise.resolve()
              .then(async function () {
                let coverUrl = currentStudent.coverUrl;
                if (coverFile && coverFile.size > 0) {
                  coverUrl = await fileToDataUrl(coverFile);
                }
                updateLocalStudent(studentId, {
                  name: String(name || ""),
                  category: String(category || ""),
                  coverUrl,
                });
                const localData = loadLocalData();
                students = localData.students;
                artworks = localData.artworks;
                renderStudentOptions();
                renderAdminStudents();
                showToast("تم تحديث بيانات الطالبة محليًا");
              })
              .catch(function () {
                showToast("تعذر تحديث البيانات محليًا", "error");
              });
            return;
          }

          Promise.resolve()
            .then(async function () {
              let coverUrl = null;
              if (coverFile && coverFile.size > 0) {
                updateProgress("student", 0, "جاري رفع الغلاف الجديد...");
                const upload = await uploadToCloudinary(coverFile, function (p) {
                  updateProgress("student", p, "جاري رفع الغلاف الجديد...");
                });
                coverUrl = upload.secure_url;
              }
              const updates = {
                name: String(name || ""),
                category: String(category || ""),
              };
              if (coverUrl) {
                updates.coverUrl = coverUrl;
              }
              await updateDoc(doc(db, "students", studentId), updates);
              updateProgress("student", 0, "");
              showToast("تم تحديث بيانات الطالبة");
            })
            .catch(function (error) {
              updateProgress("student", 0, "");
              Promise.resolve()
                .then(async function () {
                  let coverUrl = null;
                  if (coverFile && coverFile.size > 0) {
                    coverUrl = await fileToDataUrl(coverFile);
                  }
                  const updates = {
                    name: String(name || ""),
                    category: String(category || ""),
                  };
                  if (coverUrl) {
                    updates.coverUrl = coverUrl;
                  }
                  updateLocalStudent(studentId, updates);
                  const localData = loadLocalData();
                  students = localData.students;
                  artworks = localData.artworks;
                  renderStudentOptions();
                  renderAdminStudents();
                  showToast("تم حفظ التعديلات محليًا", "error");
                })
                .catch(function () {
                  showToast(error.message || "تعذر تحديث البيانات", "error");
                });
            });
        });
      }
    }
  });
}

init();
