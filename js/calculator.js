const trackConfig = {
  first: { label: "الأول ثانوي", weight: 0.35, type: "hours" },
  tawjihi: { label: "التوجيهي", weight: 0.35, type: "hours" },
  shared: {
    label: "المواد المشتركة",
    weight: 0.3,
    type: "shared",
    subjects: [
      { id: "english", name: "اللغة الإنجليزية", weight: 10 },
      { id: "arabic", name: "اللغة العربية", weight: 10 },
      { id: "islamic", name: "التربية الإسلامية", weight: 6 },
      { id: "history", name: "التاريخ", weight: 4 },
    ],
  },
};

const gradeOptions = [
  { value: "", label: "اختاري التقدير" },
  { value: 100, label: "D - Distinction (100)" },
  { value: 80, label: "M - Merit (80)" },
  { value: 60, label: "P - Pass (60)" },
  { value: 0, label: "U - Unclassified (0)" },
];

document.addEventListener("DOMContentLoaded", function () {
  const calculatorPage = document.querySelector(".calculator-shell");
  if (!calculatorPage) {
    return;
  }

  initTabs();
  initHoursTracks();
  initSharedTrack();
  bindButtons();
});

function initTabs() {
  const tabButtons = document.querySelectorAll("[data-track-tab]");
  const panels = document.querySelectorAll("[data-track-panel]");

  tabButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const target = button.dataset.trackTab;
      tabButtons.forEach(function (btn) {
        btn.classList.remove("active");
      });
      button.classList.add("active");

      panels.forEach(function (panel) {
        panel.classList.toggle(
          "active",
          panel.dataset.trackPanel === target
        );
      });
    });
  });
}

function initHoursTracks() {
  ["first", "tawjihi"].forEach(function (track) {
    addCourseRow(track);
    addCourseRow(track);
  });
}

function initSharedTrack() {
  const grid = document.querySelector("[data-shared-grid]");
  if (!grid) {
    return;
  }

  trackConfig.shared.subjects.forEach(function (subject) {
    const row = document.createElement("div");
    row.className = "shared-row";
    row.innerHTML = `
      <div>
        <strong>${subject.name}</strong>
        <small>الوزن الثابت: ${subject.weight}%</small>
      </div>
      <div class="input-field">
        <label>العلامة (0 - 100)</label>
        <input class="input" type="number" min="0" max="100" placeholder="مثال: 85" data-shared-mark="${subject.id}">
      </div>
    `;
    grid.appendChild(row);
  });
}

function bindButtons() {
  document.querySelectorAll("[data-add-course]").forEach(function (button) {
    button.addEventListener("click", function () {
      addCourseRow(button.dataset.addCourse);
    });
  });

  const calculateAllBtn = document.getElementById("calculateAll");
  if (calculateAllBtn) {
    calculateAllBtn.addEventListener("click", calculateAllTracks);
  }
}

function addCourseRow(track) {
  const list = document.querySelector(`[data-course-list="${track}"]`);
  if (!list) {
    return;
  }

  const row = document.createElement("div");
  row.className = "course-row";
  row.innerHTML = `
    <div class="input-field">
      <label>اسم المادة</label>
      <input class="input" type="text" placeholder="مثال: البرمجة" data-course-name>
    </div>
    <div class="input-field">
      <label>عدد الساعات</label>
      <input class="input" type="number" min="1" placeholder="120" data-course-hours>
    </div>
    <div class="input-field">
      <label>التقدير</label>
      <select class="input" data-course-grade>
        ${gradeOptions
          .map(function (opt) {
            return `<option value="${opt.value}">${opt.label}</option>`;
          })
          .join("")}
      </select>
    </div>
    <button type="button" class="delete-row" aria-label="حذف المادة">
      <i class="fa-solid fa-trash"></i>
    </button>
  `;

  const deleteBtn = row.querySelector(".delete-row");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", function () {
      row.remove();
    });
  }

  list.appendChild(row);
}

function calculateAllTracks() {
  const firstResult = calculateHoursTrack("first");
  const tawjihiResult = calculateHoursTrack("tawjihi");
  const sharedResult = calculateSharedTrack();

  const results = [firstResult, tawjihiResult, sharedResult];
  const breakdownList = document.getElementById("breakdownList");
  const finalScoreEl = document.getElementById("finalScore");

  results.forEach(updateTrackResult);

  if (breakdownList) {
    breakdownList.innerHTML = "";
  }

  let finalSum = 0;
  results.forEach(function (result) {
    if (result.valid) {
      finalSum += result.contribution;
      if (breakdownList) {
        const item = document.createElement("li");
        item.textContent = `${result.label}: ${result.contribution.toFixed(
          2
        )} من ${result.max.toFixed(2)}`;
        breakdownList.appendChild(item);
      }
    }
  });

  const allValid = results.every(function (result) {
    return result.valid;
  });

  if (finalScoreEl) {
    finalScoreEl.textContent = allValid
      ? `معدلك النهائي هو ${finalSum.toFixed(2)} من 100`
      : "أكملي بيانات جميع المسارات لتحصلي على المعدل النهائي.";
  }
}

function calculateHoursTrack(track) {
  const list = document.querySelector(`[data-course-list="${track}"]`);
  const resultBox = document.querySelector(`[data-track-result="${track}"]`);
  const maxContribution = trackConfig[track].weight * 100;

  if (!list) {
    return {
      valid: false,
      contribution: 0,
      max: maxContribution,
      element: resultBox,
      label: trackConfig[track].label,
      message: "أضيفي مواد لهذا المسار.",
    };
  }

  const rows = Array.from(list.querySelectorAll(".course-row"));
  let totalHours = 0;
  let totalPoints = 0;

  rows.forEach(function (row) {
    const hoursValue = row.querySelector("[data-course-hours]")?.value || "";
    const gradeValue = row.querySelector("[data-course-grade]")?.value || "";
    const hours = Number(hoursValue);
    const grade = Number(gradeValue);
    if (!hoursValue || !gradeValue || hours <= 0 || Number.isNaN(grade)) {
      return;
    }
    totalHours += hours;
    totalPoints += hours * grade;
  });

  if (totalHours === 0) {
    return {
      valid: false,
      contribution: 0,
      max: maxContribution,
      element: resultBox,
      label: trackConfig[track].label,
      message: "أدخلي ساعات وتقديرات صالحة.",
    };
  }

  const average = totalPoints / totalHours;
  const contribution = (average / 100) * maxContribution;

  return {
    valid: true,
    contribution: contribution,
    max: maxContribution,
    element: resultBox,
    label: trackConfig[track].label,
    message: `معدل المسار: ${average.toFixed(
      2
    )} ➜ مساهمة ${contribution.toFixed(2)} من ${maxContribution}`,
  };
}

function calculateSharedTrack() {
  const resultBox = document.querySelector('[data-track-result="shared"]');
  const subjects = trackConfig.shared.subjects;
  const maxContribution = trackConfig.shared.weight * 100;

  let contribution = 0;
  let filledSubjects = 0;

  subjects.forEach(function (subject) {
    const input = document.querySelector(
      `[data-shared-mark="${subject.id}"]`
    );
    const value = input?.value || "";
    const mark = Number(value);
    if (!input || value === "" || Number.isNaN(mark) || mark < 0 || mark > 100) {
      return;
    }
    filledSubjects += 1;
    contribution += (mark / 100) * subject.weight;
  });

  const valid = filledSubjects === subjects.length;

  return {
    valid: valid,
    contribution: valid ? contribution : 0,
    max: maxContribution,
    element: resultBox,
    label: trackConfig.shared.label,
    message: valid
      ? `مجموع المواد المشتركة: ${contribution.toFixed(
          2
        )} من ${maxContribution}`
      : "أدخلي علامة لكل مادة مشتركة (0 - 100).",
  };
}

function updateTrackResult(result) {
  if (!result.element) {
    return;
  }
  result.element.textContent = result.message || "";
  result.element.classList.toggle("error", !result.valid);
}
