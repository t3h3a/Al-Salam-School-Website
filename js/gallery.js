import { firebaseConfig } from "./config.js";
import {
  loadDeletedIds,
  loadLocalData,
  saveLocalArtworks,
  saveLocalStudents,
} from "./local-store.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const galleryGrid = document.getElementById("gallery-grid");
const skeletonGrid = document.getElementById("gallery-skeleton");
const emptyState = document.getElementById("gallery-empty");
const searchInput = document.getElementById("search-input");
const categoryFilter = document.getElementById("category-filter");
const statsValue = document.getElementById("gallery-stats");

let students = [];
let artworks = [];
let dataReady = { students: false, artworks: false };

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

const observer =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("in-view");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2 }
      )
    : null;

function observeElement(element) {
  if (!element) {
    return;
  }
  if (observer) {
    observer.observe(element);
  } else {
    element.classList.add("in-view");
  }
}

function setLoading(isLoading) {
  if (skeletonGrid) {
    skeletonGrid.style.display = isLoading ? "block" : "none";
  }
  if (galleryGrid) {
    galleryGrid.style.display = isLoading ? "none" : "block";
  }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function updateStats(count) {
  if (statsValue) {
    statsValue.textContent = count.toString();
  }
}

function applyLocalData(forceRender) {
  const localData = loadLocalData();
  const deleted = loadDeletedIds();
  const nextStudents = localData.students.filter(function (item) {
    return !deleted.students.includes(item.id);
  });
  const nextArtworks = localData.artworks.filter(function (item) {
    return !deleted.artworks.includes(item.id);
  });
  if (!forceRender && nextStudents.length === 0 && nextArtworks.length === 0) {
    return false;
  }
  students = nextStudents;
  artworks = nextArtworks;
  dataReady.students = true;
  dataReady.artworks = true;
  renderGallery();
  return true;
}

function renderGallery() {
  if (!galleryGrid) {
    return;
  }
  if (!dataReady.students || !dataReady.artworks) {
    setLoading(true);
    return;
  }
  setLoading(false);

  const term = normalize(searchInput ? searchInput.value : "");
  const selected = categoryFilter ? categoryFilter.value : "all";

  const filtered = students.filter(function (student) {
    const nameMatch = normalize(student.name).includes(term);
    const categoryMatch =
      selected === "all" ||
      normalize(student.category) === normalize(selected) ||
      artworks.some(function (art) {
        return (
          art.studentId === student.id &&
          normalize(art.type) === normalize(selected)
        );
      });
    return nameMatch && categoryMatch;
  });

  updateStats(filtered.length);
  galleryGrid.innerHTML = "";

  filtered.forEach(function (student) {
    const card = document.createElement("div");
    card.className = "student-card";
    card.setAttribute("data-animate", "true");

    const cover = document.createElement("img");
    cover.className = "student-cover";
    cover.src = student.coverUrl;
    cover.alt = student.name;
    cover.loading = "lazy";
    cover.decoding = "async";

    const body = document.createElement("div");
    body.className = "student-body";

    const name = document.createElement("div");
    name.className = "student-name";
    name.textContent = student.name;

    const count = artworks.filter(function (art) {
      return art.studentId === student.id;
    }).length;
    const countText = document.createElement("div");
    countText.className = "student-count";
    countText.textContent = `عدد الأعمال: ${count}`;

    const actions = document.createElement("div");
    actions.className = "student-actions";

    const link = document.createElement("a");
    link.className = "btn outline";
    link.href = `student.html?id=${encodeURIComponent(student.id)}`;
    link.textContent = "عرض المزيد";

    actions.appendChild(link);
    body.appendChild(name);
    body.appendChild(countText);
    body.appendChild(actions);
    card.appendChild(cover);
    card.appendChild(body);
    galleryGrid.appendChild(card);
    observeElement(card);
  });

  if (emptyState) {
    if (filtered.length === 0) {
      emptyState.hidden = false;
      emptyState.textContent = "لا توجد نتائج مطابقة للبحث أو الفلترة.";
    } else {
      emptyState.hidden = true;
    }
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

function init() {
  applyLocalData(false);

  if (!isFirebaseConfigured()) {
    setLoading(false);
    if (emptyState && students.length === 0) {
      emptyState.hidden = false;
      emptyState.textContent = "يرجى تحديث إعدادات Firebase في config.js";
    }
    return;
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const studentsRef = collection(db, "students");
  const artworksRef = collection(db, "artworks");

  onSnapshot(
    query(studentsRef, orderBy("createdAt", "desc")),
    function (snap) {
      const remoteStudents = snap.docs.map(function (docItem) {
        return { id: docItem.id, ...docItem.data() };
      });
      const stored = loadLocalData();
      const deletedIds = loadDeletedIds();
      students = mergeWithLocal(remoteStudents, stored.students).filter(
        function (item) {
          return !deletedIds.students.includes(item.id);
        }
      );
      students.sort(function (a, b) {
        return getCreatedAtValue(b.createdAt) - getCreatedAtValue(a.createdAt);
      });
      saveLocalStudents(students);
      dataReady.students = true;
      renderGallery();
    },
    function () {
      applyLocalData(true);
    }
  );

  onSnapshot(
    query(artworksRef, orderBy("createdAt", "desc")),
    function (snap) {
      const remoteArtworks = snap.docs.map(function (docItem) {
        return { id: docItem.id, ...docItem.data() };
      });
      const stored = loadLocalData();
      const deletedIds = loadDeletedIds();
      artworks = mergeWithLocal(remoteArtworks, stored.artworks).filter(
        function (item) {
          return !deletedIds.artworks.includes(item.id);
        }
      );
      artworks.sort(function (a, b) {
        return getCreatedAtValue(b.createdAt) - getCreatedAtValue(a.createdAt);
      });
      saveLocalArtworks(artworks);
      dataReady.artworks = true;
      renderGallery();
    },
    function () {
      applyLocalData(true);
    }
  );

  window.addEventListener("storage", function (event) {
    if (event.key && !event.key.startsWith("btec_")) {
      return;
    }
    applyLocalData(true);
  });

  if (searchInput) {
    searchInput.addEventListener("input", renderGallery);
  }
  if (categoryFilter) {
    categoryFilter.addEventListener("change", renderGallery);
  }
}

init();
