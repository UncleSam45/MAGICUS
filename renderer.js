const $ = (selector) => document.querySelector(selector);
const splash = $("#splash");
const login = $("#login");
const studio = $("#studio");
const form = $("#access-form");
const username = $("#username");
const accessKey = $("#access-key");
const errorBox = $("#error");
const submit = form.querySelector(".enter");

for (let index = 0; index < 34; index += 1) {
  const particle = document.createElement("i");
  particle.className = "particle";
  particle.style.left = `${Math.random() * 100}%`;
  particle.style.top = `${Math.random() * 100 + 30}%`;
  particle.style.setProperty("--duration", `${7 + Math.random() * 10}s`);
  particle.style.animationDelay = `${-Math.random() * 12}s`;
  $("#particles").appendChild(particle);
}

setTimeout(() => {
  splash.classList.add("depart");
  setTimeout(() => { splash.classList.remove("active"); login.classList.add("active"); username.focus(); }, 650);
}, 3100);

$("#reveal").addEventListener("click", (event) => {
  const concealed = accessKey.type === "password";
  accessKey.type = concealed ? "text" : "password";
  event.currentTarget.textContent = concealed ? "HIDE" : "VIEW";
  event.currentTarget.setAttribute("aria-label", concealed ? "Hide access key" : "Show access key");
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("show");
  requestAnimationFrame(() => errorBox.classList.add("show"));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const displayName = username.value.trim();
  const key = accessKey.value.trim();
  if (!displayName || !key) return showError("Complete both fields to enter MAGICUS.");

  errorBox.classList.remove("show");
  submit.classList.add("loading");
  submit.disabled = true;
  accessKey.value = "";
  accessKey.type = "password";
  let result;
  try { result = await window.magicus.validateAccess(key); }
  catch { result = { ok: false, message: "Access validation is temporarily unavailable. Please try again." }; }
  submit.classList.remove("loading");
  submit.disabled = false;
  if (!result.ok) { showError(result.message); accessKey.focus(); return; }

  $("#display-name").textContent = displayName;
  login.classList.remove("active");
  setTimeout(() => studio.classList.add("active"), 350);
});
