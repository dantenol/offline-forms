"use strict";
const jsdom = require("jsdom");
const fs = require("fs");
const pretty = require("pretty");
const inquirer = require("inquirer");

const { JSDOM } = jsdom;

const parsed = [];

const urlRegex = /https:\/\/docs.google.com\/forms\/.+?\/viewform/g;

function getType(obj) {
  const pureElem = obj.querySelector("input, textarea");
  if (pureElem && pureElem.tagName === "TEXTAREA") {
    return "textarea";
  } else if (pureElem && pureElem.type === "text") {
    return "text";
  } else if (obj.querySelector("[role='radiogroup']")) {
    return "radio[]";
  } else if (obj.querySelector("[role='list']")) {
    return "checkbox[]";
  } else if (obj.querySelector("[role='listbox']")) {
    return "select[]";
  }
}

function getSubtitle(elem) {
  if (elem) {
    return elem.textContent;
  }
}

function getAlternatives(elem) {
  const alternatives = [];
  const radio = elem.querySelector("[role='radiogroup'], [role='list']");
  if (radio) {
    radio.querySelectorAll("label").forEach((e) => {
      alternatives.push(e.textContent);
    });
    return alternatives;
  }

  const dropdown = elem.querySelector("[role='listbox']");
  if (dropdown) {
    dropdown
      .querySelectorAll("[role='option']:not(.isPlaceholder)")
      .forEach((e) => {
        alternatives.push(e.textContent);
      });
    return alternatives;
  }
}

function isRequired(elem) {
  return Boolean(
    elem.querySelector(".freebirdFormviewerViewItemsItemRequiredAsterisk")
  );
}

function getName(elem) {
  const el = elem.querySelector("[name^='entry']");
  const name = /entry\.\d+/g.exec(el.name);
  return name[0];
}

function readData(q, i) {
  const data = {};
  data.title = q.querySelector("[role='heading']").textContent;
  data.subtitle = getSubtitle(
    q.querySelector(".freebirdFormviewerViewItemsItemItemHelpText")
  );
  data.type = getType(q);
  if (data.type && data.type.includes("[]")) {
    data.options = getAlternatives(q);
    data.type = data.type.slice(0, -2);
  }
  data.required = isRequired(q);
  data.name = getName(q);
  parsed.push(data);
}

function buildQuestion(type, options, name, required) {
  switch (type) {
    case "text":
      return buildInput(name, required);
    case "textarea":
      return buildTextarea(name, required);
    case "radio":
      return buildMultipleChoice(name, options, "radio", required);
    case "checkbox":
      return buildMultipleChoice(name, options, "checkbox", required);
    case "select":
      return buildSelect(name, options, required);
    default:
      break;
  }
}

function buildInput(name, required) {
  const q = new JSDOM("<input />");
  const el = q.window.document.querySelector("input");
  el.type = "text";
  el.name = name;
  el.id = /\d+/g.exec(name);
  el.placeholder = "Digite aqui...";
  if (required) {
    el.setAttribute("data-required", "true");
  }
  return el;
}

function buildTextarea(name, required) {
  const q = new JSDOM("<textarea />");
  const el = q.window.document.querySelector("textarea");
  el.name = name;
  el.id = /\d+/g.exec(name);
  el, (el.placeholder = "Digite aqui...");
  if (required) {
    el.setAttribute("data-required", "true");
  }
  return el;
}

function buildMultipleChoice(name, options, type, required) {
  const q = new JSDOM("<div class='multipleChoiceContainer' />");
  const el = q.window.document.querySelector("div");
  if (required) {
    el.setAttribute("data-required", "true");
  }
  options.forEach((o, i) => {
    const inp = q.window.document.createElement("input");
    const label = q.window.document.createElement("label");
    const br = q.window.document.createElement("br");
    const br2 = q.window.document.createElement("br");
    inp.type = type;
    inp.value = o;
    inp.name = name;
    inp.id = "" + /\d+/g.exec(name) + "." + o;
    label.htmlFor = "" + /\d+/g.exec(name) + "." + o;
    label.innerHTML = o;
    el.appendChild(inp);
    el.appendChild(label);
    if (i < options.length - 1) {
      el.appendChild(br);
      el.appendChild(br2);
    }
  });
  return el;
}

function buildSelect(name, options, required) {
  const q = new JSDOM("<select />");
  const el = q.window.document.querySelector("select");
  if (required) {
    el.setAttribute("data-required", "true");
  }
  el.name = name;
  el.id = /\d+/g.exec(name);
  options.unshift("");
  options.forEach((o) => {
    const opt = q.window.document.createElement("option");
    opt.value = o;
    opt.innerHTML = o;
    el.appendChild(opt);
  });
  return el;
}

function buildLogic(build, formURL, finishURL, fullscreen, startMsg, offline) {
  let script = `
  let step = 0;
  const build = ${JSON.stringify(build)};
  const hasMessage = ${Number(Boolean(startMsg))};
  const height = window.document.documentElement.clientHeight;

  function checkFilled() {
    let i = step;
    if (hasMessage && i === 0) {
      return true;
    } else if (hasMessage) {
      i--;
    }
    let name = build[i].name;
    let el = document.getElementsByName(name);

    let hasValue = false;
    let isRequired = false;
    let regex = null;
    let regexMatch = true;
    el.forEach((e) => {
      if (e.getAttribute("data-required") === "true") isRequired = true; 
      if (e.getAttribute("data-regex")) {
        regex = new RegExp(e.getAttribute("data-regex"));
        regexMatch = false;
      } 
      if (e.value) hasValue = true; 
      if (regex && regex.test(e.value)) regexMatch = true; 
    })

    return Boolean(regexMatch && (!isRequired || (isRequired && hasValue)));
  }
  
  function next() {
    const canPass = checkFilled();
    if (!canPass) {
      alert("Você deve responder propriamente para continuar!");
      return false;
    }
    const els = document.querySelectorAll(".question");
    els.forEach((e) => {
      e.style.top = "-" + (step + 1) * 100 + "%";
    });
    step++;
  }
  
  function listCheckbox(obj, name, val) {
    console.log(obj, name, val);
    if (!obj[name]) {
      obj[name] = [val];
    } else {
      obj[name].push(val);
    }
    console.log(obj);
    return obj;
  }

  function formatObj() {
    obj = {};
    const e = document.querySelectorAll("input, textarea, select");
    for (let i = 0; i < e.length; i++) {
      let c = e[i],
        n = c.getAttribute("name");
      if (n) {
        if (
          ((c.type === "checkbox" || c.type === "radio") && c.checked) ||
          (c.type !== "checkbox" && c.type !== "radio" && obj[n])
        ) {
          obj = listCheckbox(obj, n, c.value);
        } else if (c.type !== "checkbox" && c.type !== "radio") {
          obj[n] = c.value;
        }
      }
    }
    const linearObj = {}
    Object.keys(obj).forEach(k => {
      linearObj[k] = String(obj[k]);
    });

    console.log(linearObj)
    return linearObj;
  }

  function checkData(data) {
    Object.keys(data).forEach((entry, i) => {
      if (build[i].required && !data[entry]) {
        highlightRequired(entry);
        throw "Campo obrigatório";
      }
    });
  }

  function highlightRequired(name) {
    document.getElementsByName(name).forEach((e) => {
      e.classList.add("blink");
      setTimeout(
        e.classList.remove("blink"),
        4000,
      )
    })
  }

  async function send() {
    const data = formatObj();
    checkData(data);
    const formData = new FormData();
    for (var key in data) {
      formData.append(key, data[key]);
    }
  
    try {
      const res = await fetch(
        "${formURL.replace("viewform", "formResponse")}",
        {
          method: "POST",
          mode: "no-cors",
          body: formData
        }
      );
      window.location.href = "${finishURL}";
    } catch (error) {
      console.log(error);
    }

    document.getElementById("send").disabled = true;
  }

  function save() {
    const data = formatObj();
    checkData(data);
    const id = "answer." + Math.round(Math.random() * (9999 - 1000) + 1000);
    localStorage.setItem(id, JSON.stringify(data));
    alert("Suas respostas foram salvas. Não esqueça de envia-las mais tarde!")
  }

  function submit() {
    if (${offline}) {
      save();
    } else {
      send();
    }
  }

  window.document.querySelectorAll("button.next").forEach(b => {
    b.addEventListener("click", next, false);
  });

  window.document.getElementById("send").addEventListener("click", submit, false);

  window.addEventListener("load", function () {
    if (${fullscreen}) {
      document.querySelectorAll("input").forEach((e) =>
        e.addEventListener("keypress", function (e) {
          if (e.key === "Enter") {
            next();
          }
        })
      );

      document.querySelectorAll("input[type='radio']").forEach(e => {
        e.addEventListener("click", () => {
          setTimeout(next, 200);
        }, false)
      });
    }

    const masks = document.querySelectorAll("[data-mask]");

    if (masks.length) {
      let script = "";
      masks.forEach((el) => {
        const id = el.id;
        const mask = el.getAttribute("data-mask");
        console.log(id, mask);
        script += \`const Mask_\${id} = IMask(document.getElementById("\${id}"), {
          mask: [
            {
              mask: "\${mask}",
            },
          ],
        });\`;
      });
      const scr = document.createElement("script");
      scr.innerHTML = script;
      window.document.body.appendChild(scr);
    }
  });`;

  return script;
}

function buildPage({ startMsg, finishURL, fullscreen, url, offline }) {
  const page = new JSDOM("<html><body></body></html>");
  const head = page.window.document.head;
  head.innerHTML = `<meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Form</title>
  <script src="https://unpkg.com/imask"></script>
  <link rel="stylesheet" href="./index.css" />`;

  const container = page.window.document.createElement("div");
  container.id = "formContainer";
  if (fullscreen) {
    container.className = "fullscreen";
  }

  page.window.document.body.appendChild(container);
  if (startMsg) {
    const questionEl = page.window.document.createElement("div");
    questionEl.className = "question";
    const title = page.window.document.createElement("p");
    title.innerHTML = startMsg;
    title.className = "title";
    const btn = page.window.document.createElement("button");
    btn.innerHTML = "Começar";
    btn.className = "next";
    questionEl.appendChild(title);
    questionEl.appendChild(btn);
    container.appendChild(questionEl);
  }

  parsed.forEach((q, i) => {
    const questionEl = page.window.document.createElement("div");
    questionEl.className = "question";
    const title = page.window.document.createElement("p");
    title.innerHTML = q.title;
    title.className = "title";
    if (q.required) {
      title.innerHTML = title.innerHTML.replace(" *", "<span>*</span>");
    }
    questionEl.appendChild(title);
    if (q.subtitle) {
      const subtitle = page.window.document.createElement("p");
      subtitle.className = "subtitle";
      subtitle.innerHTML = q.subtitle;
      questionEl.appendChild(subtitle);
    }
    const question = buildQuestion(q.type, q.options, q.name, q.required);
    if (question) {
      questionEl.appendChild(question);
    } else {
      const error = page.window.document.createElement("h1");
      error.innerHTML = "Erro ao carregar";
      questionEl.appendChild(error);
    }
    if (fullscreen && i !== parsed.length - 1) {
      const btn = page.window.document.createElement("button");
      btn.innerHTML = "Próximo";
      btn.className = "next";
      questionEl.appendChild(btn);
    } else if (i === parsed.length - 1) {
      const br = page.window.document.createElement("br");
      questionEl.appendChild(br);
      const btn = page.window.document.createElement("button");
      btn.innerHTML = "Finalizar";
      btn.id = "send";
      questionEl.appendChild(btn);
    }

    container.appendChild(questionEl);
  });

  const scripts = buildLogic(parsed, url, finishURL, fullscreen, startMsg, offline);
  const scriptEl = page.window.document.createElement("script");
  scriptEl.innerHTML = scripts;
  console.log(scriptEl.outerHTML);
  page.window.document.body.appendChild(scriptEl);
  return page.serialize();
}

const promptConfig = [
  {
    type: "input",
    name: "url",
    message: "Google Forms URL",
    validate: function (value) {
      var pass = value.match(urlRegex);
      if (pass) {
        return true;
      }

      return "Insert a valid URL";
    },
  },
  {
    type: "input",
    name: "startMsg",
    message: "Welcome message (optimal)",
  },
  {
    type: "confirm",
    name: "fullscreen",
    default: false,
    message: "Show questions one by one? (Typeform-like)",
  },
  {
    type: "confirm",
    name: "offline",
    default: false,
    message: "Make it offline-first?",
  },
  {
    type: "input",
    name: "finishURL",
    default: "#",
    message: "Redirecting URL after submission (optimal)",
  },
  {
    type: "input",
    name: "filename",
    message: "Output file name (.html)",
    default: "form",
  },
];

async function run() {
  const settings = await inquirer.prompt(promptConfig);
  const dom = await JSDOM.fromURL(settings.url);

  const questions = dom.window.document.querySelectorAll(
    ".freebirdFormviewerViewNumberedItemContainer"
  );

  questions.forEach(readData);

  const page = buildPage(settings);
  const prettyHTML = pretty(page);
  await fs.writeFileSync(settings.filename + ".html", prettyHTML);
  console.log("done");
}

run();
