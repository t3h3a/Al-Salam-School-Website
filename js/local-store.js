const STUDENTS_KEY = "btec_students_local_v1";
const ARTWORKS_KEY = "btec_artworks_local_v1";
const STUDENTS_DELETED_KEY = "btec_students_deleted_v1";
const ARTWORKS_DELETED_KEY = "btec_artworks_deleted_v1";

function safeParse(value) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function readList(key) {
  return safeParse(localStorage.getItem(key));
}

function writeList(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

function readIdList(key) {
  return safeParse(localStorage.getItem(key));
}

function writeIdList(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

function toMillis(value) {
  if (!value) {
    return Date.now();
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  return Date.now();
}

function sanitizeStudent(student) {
  return {
    id: student.id,
    name: student.name,
    category: student.category,
    coverUrl: student.coverUrl,
    createdAt: toMillis(student.createdAt),
    localOnly: Boolean(student.localOnly),
  };
}

function sanitizeArtwork(artwork) {
  return {
    id: artwork.id,
    studentId: artwork.studentId,
    type: artwork.type,
    title: artwork.title,
    description: artwork.description,
    mediaType: artwork.mediaType,
    imageUrl: artwork.imageUrl,
    videoUrl: artwork.videoUrl,
    createdAt: toMillis(artwork.createdAt),
    localOnly: Boolean(artwork.localOnly),
  };
}

function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function loadLocalData() {
  return {
    students: readList(STUDENTS_KEY),
    artworks: readList(ARTWORKS_KEY),
  };
}

export function loadDeletedIds() {
  return {
    students: readIdList(STUDENTS_DELETED_KEY),
    artworks: readIdList(ARTWORKS_DELETED_KEY),
  };
}

export function markStudentDeleted(studentId) {
  if (!studentId) {
    return;
  }
  const ids = readIdList(STUDENTS_DELETED_KEY);
  if (!ids.includes(studentId)) {
    ids.push(studentId);
    writeIdList(STUDENTS_DELETED_KEY, ids);
  }
}

export function markArtworkDeleted(artworkId) {
  if (!artworkId) {
    return;
  }
  const ids = readIdList(ARTWORKS_DELETED_KEY);
  if (!ids.includes(artworkId)) {
    ids.push(artworkId);
    writeIdList(ARTWORKS_DELETED_KEY, ids);
  }
}

export function clearStudentDeleted(studentId) {
  if (!studentId) {
    return;
  }
  const ids = readIdList(STUDENTS_DELETED_KEY).filter(function (id) {
    return id !== studentId;
  });
  writeIdList(STUDENTS_DELETED_KEY, ids);
}

export function clearArtworkDeleted(artworkId) {
  if (!artworkId) {
    return;
  }
  const ids = readIdList(ARTWORKS_DELETED_KEY).filter(function (id) {
    return id !== artworkId;
  });
  writeIdList(ARTWORKS_DELETED_KEY, ids);
}

export function saveLocalStudents(items) {
  const normalized = items.map(sanitizeStudent);
  writeList(STUDENTS_KEY, normalized);
}

export function saveLocalArtworks(items) {
  const normalized = items.map(sanitizeArtwork);
  writeList(ARTWORKS_KEY, normalized);
}

export function addLocalStudent(student) {
  const students = readList(STUDENTS_KEY);
  const entry = sanitizeStudent({
    ...student,
    id: student.id || createId("student"),
    createdAt: student.createdAt || Date.now(),
    localOnly: student.localOnly || false,
  });
  students.unshift(entry);
  writeList(STUDENTS_KEY, students);
  return entry;
}

export function updateLocalStudent(studentId, updates) {
  const students = readList(STUDENTS_KEY);
  const next = students.map((student) => {
    if (student.id !== studentId) {
      return student;
    }
    return sanitizeStudent({
      ...student,
      ...updates,
      id: student.id,
      createdAt: student.createdAt,
    });
  });
  writeList(STUDENTS_KEY, next);
  return next;
}

export function removeLocalStudent(studentId) {
  const students = readList(STUDENTS_KEY).filter(
    (student) => student.id !== studentId
  );
  const artworks = readList(ARTWORKS_KEY).filter(
    (artwork) => artwork.studentId !== studentId
  );
  writeList(STUDENTS_KEY, students);
  writeList(ARTWORKS_KEY, artworks);
  return { students, artworks };
}

export function addLocalArtwork(artwork) {
  const artworks = readList(ARTWORKS_KEY);
  const entry = sanitizeArtwork({
    ...artwork,
    id: artwork.id || createId("artwork"),
    createdAt: artwork.createdAt || Date.now(),
    localOnly: artwork.localOnly || false,
  });
  artworks.unshift(entry);
  writeList(ARTWORKS_KEY, artworks);
  return entry;
}

export function removeLocalArtwork(artworkId) {
  const artworks = readList(ARTWORKS_KEY).filter(
    (artwork) => artwork.id !== artworkId
  );
  writeList(ARTWORKS_KEY, artworks);
  return artworks;
}
