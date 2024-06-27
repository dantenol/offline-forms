import { JSDOM } from "jsdom";
import fs from "fs";
import pretty from "pretty";
import inquirer from "inquirer";

const parsed = [];

const urlRegex = /https:\/\/docs.google.com\/forms\/.+?\/viewform/g;

function getType(obj) {
  // console.log('question type', obj.outerHTML)
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
      .querySelectorAll("[role='option']:not([data-value=''])")
      .forEach((e) => {
        alternatives.push(e.textContent);
      });
    return alternatives;
  }
}

function isRequired(elem) {
  const header = elem.querySelector("[role='heading']");
  if (header.textContent.endsWith("*")) {
    return true;
  }
}

function getTitle(elem) {
  const header = elem.querySelector("[role='heading']");
  const clean = header.textContent.trim();
  return clean;
}

// name is the internal identifier for the question
function getName(elem) {
  const el = elem.dataset.params;
  const name = /\[\[([0-9]{7,})/g.exec(el);
  return name[1];
}

function readData(q, i) {
  const data = {};
  data.title = getTitle(q);
  data.name = "entry_" + getName(q);
  data.type = getType(q);
  if (data.type && data.type.endsWith("[]")) {
    data.options = getAlternatives(q);
    data.type = data.type.slice(0, -2);
  }
  data.required = isRequired(q);
  // console.log(data, i);
  parsed.push(data);
}

function buildQuestion({ type, options, name, required, title }) {
  switch (type) {
    case "text":
      return buildInput(title, name, required);
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

/**
 * recieves the title or options and extracts the configurations.
 * SKIP is the number of steps to skip if the option is selected
 * MASK is the input mask for the input
 * REGEX is the regex to validate the input
 * @param {string} title
 * @returns string
 */
function getConfigs(title) {
  const originalTitle = title.split("//")[0].trim();
  const configText = title.match(/\/\/\s?\[.+\](\s\*)?$/g);
  if (!configText) {
    return { originalTitle };
  }

  const skipValue = /SKIP=(\d+)( |\])/g.exec(configText);
  const maskValue = /MASK=(.+?)( |\])/g.exec(configText);
  const regexValue = /REGEX=(\^.+?\$)( |\])/g.exec(configText);
  const samePageValue = /SAMEPAGE=(TRUE)( |\])/g.exec(configText);
  const placeholderValue = /PLACEHOLDER=(.+?)( |\])/g.exec(configText);
  const skip = skipValue ? skipValue[1] : undefined;
  const mask = maskValue ? maskValue[1] : undefined;
  const regex = regexValue ? regexValue[1] : undefined;
  const samePage = samePageValue ? samePageValue[1] === "TRUE" : undefined;

  const placeholder = placeholderValue ? placeholderValue[1] : undefined;

  return { originalTitle, skip, mask, regex, samePage, placeholder };
}

function buildInput(title, name, required) {
  const q = new JSDOM("<input />");
  const el = q.window.document.querySelector("input");
  const { originalTitle, skip, mask, regex, placeholder } = getConfigs(title);
  console.log(originalTitle, skip, mask, regex);
  el.type = "text";
  el.name = name;
  if (mask) {
    el.setAttribute("data-mask", mask);
  }
  if (regex) {
    el.setAttribute("data-regex", regex);
  }
  el.id = /\d+/g.exec(name);
  el.placeholder = placeholder || "Digite aqui...";
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

  // set vertical or horizontal class based on the quantity of options
  if (options.length > 2) {
    el.classList.add("vertical");
  } else {
    el.classList.add("horizontal");
  }
  options.forEach((o) => {
    const { originalTitle, skip, mask, regex } = getConfigs(o);
    const optionContainer = q.window.document.createElement("div");
    optionContainer.className = "optionContainer";
    const inp = q.window.document.createElement("input");
    const label = q.window.document.createElement("label");
    inp.type = type;
    inp.value = originalTitle;
    inp.name = name;
    if (required) {
      inp.setAttribute("data-required", "true");
    }
    if (skip) {
      inp.setAttribute("data-skip", skip);
    }
    if (mask) {
      inp.setAttribute("data-mask", mask);
    }
    if (regex) {
      inp.setAttribute("data-regex", regex);
    }
    inp.id = "" + /\d+/g.exec(name) + "." + originalTitle;
    label.htmlFor = "" + /\d+/g.exec(name) + "." + originalTitle;
    label.innerHTML = originalTitle;
    optionContainer.appendChild(inp);
    optionContainer.appendChild(label);
    el.appendChild(optionContainer);
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

function buildLogic(
  build,
  responseURL,
  finishMessage,
  fullscreen,
  startMsg,
  offline
) {
  let script = `
  let step = 0;
  const build = ${JSON.stringify(build)};
  const hasMessage = ${Number(Boolean(startMsg))};
  const height = window.document.documentElement.clientHeight;

  function checkFilled() {
    let i = step;
    if (hasMessage && step === 0) {
      return true;
    }
    const inputElementNames = document.querySelectorAll(".question")[i].querySelectorAll("[name]");

    // extract unique values
    const names = []
    inputElementNames.forEach((e) => {
      if (!names.includes(e.name)) {
        names.push(e.name);
      }
    });

    const checks = names.map((n) => {
      const buildConfig = build.find((b) => b.name === n.name);
      const el = document.getElementsByName(n);
      let hasValue = false;
      let isRequired = false;
      let regex = null;
      let regexMatch = true;
      let filledProp = "value"
      if (["radio", "checkbox"].includes(el[0].type)) {
        filledProp = "checked";
      }
      el.forEach((e) => {
        if (e.getAttribute("data-required") === "true") isRequired = true;
        if (e.getAttribute("data-regex")) {
          regex = new RegExp(e.getAttribute("data-regex"));
          regexMatch = false;
        }
        if (e[filledProp]) hasValue = true;
        if (regex && regex.test(e.value)) regexMatch = true;
      })

      return Boolean(regexMatch && (!isRequired || (isRequired && hasValue)));
    });

    return checks.every((c) => c === true);
  }

  function nextBtnClick() {        
    const question = document.querySelectorAll(".question")[step];
    const selectedRadio = question.querySelector("[name][type='radio']:checked")
    if (!selectedRadio) {
      next();
      return;
    }
    const skip = selectedRadio?.dataset?.skip;
    console.log(skip);
    if (skip) {
      next(skip);
    } else {
      next();
    }
  }

  function next(goToNext) {
    let add = 1;
    if (typeof goToNext === "string" && Number.isInteger(parseInt(goToNext))) {
      add = parseInt(goToNext);
    }
    const canPass = checkFilled();
    if (!canPass) {
      alert("Você deve responder propriamente para continuar!");
      return false;
    }
    const els = document.querySelectorAll(".question");
    els.forEach((e) => {
      e.style.top = "-" + (step + add) * 100 + "%";
    });
    step += add;
  }

  function listCheckbox(obj, name, val) {
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
      if (Array.isArray(obj[k])) {
        linearObj[k] = obj[k];
      } else {
        linearObj[k] = String(obj[k]);
      }
    });

    console.log(linearObj)
    return linearObj;
  }

  function checkData(data) {
    if (${fullscreen}) {
      return;
    };
    build.forEach((q) => {
      if (q.required && !data[q.name]) {
        console.log(q.name, data)
        highlightRequired(q.name);
        throw "Campo obrigatório " + q.title;
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

  function convertObjectToURLSearchParams(obj) {
    const params = new URLSearchParams();
    
    Object.entries(obj).forEach(([key, value]) => {
      const correctKey = key.replace(/entry\./g, "entry_");
      if (Array.isArray(value)) {
        value.forEach(item => {
          params.append(correctKey, item);
        });
      } else {
        params.append(correctKey, value);
      }
    });
    
    return params;
  }

  async function send() {
    const data = formatObj();
    checkData(data);
    const paramsObj = {
      ...data,
      // these are random values that are needed to send the form to prevent CORS error
      callback: "jQuery36101560114710959728_1718735723536",
      fvv: 1,
      fbzx: -7285727184728930223,
      pageHistory: 0,
      _: 1718735723538,
    }
    const params = convertObjectToURLSearchParams(paramsObj);
    document.getElementById("send").disabled = true;

    try {
      const res = await axios(
        "${responseURL.replace("viewform", "formResponse")}?" + params,
      );
    } catch (error) {
      document.getElementById("send").disabled = false;
      // show status code and message
      console.log(error);
      console.log(error.response.status, error.response.data);
    } finally {
      if ("${finishMessage}".startsWith("http")) {
        window.location.href = "${finishMessage}";
      } else {
        next();
      }
    }
  }

  function resetForm() {
    document.querySelectorAll("[name]").forEach((e) => {
      e.value = null;
      e.checked = false;
    });

    step = 0;

    document.querySelectorAll(".question").forEach(e => {
      e.style.top = "";
    });
  }

  function save() {
    const data = formatObj();
    checkData(data);
    const id = "answer." + Math.round(Math.random() * (9999 - 1000) + 1000);
    localStorage.setItem(id, JSON.stringify(data));
    alert("Suas respostas foram salvas. Não esqueça de envia-las mais tarde!");
    resetForm()
  }

  function submit() {
    if (${offline}) {
      save();
    } else {
      send();
    }
  }

  window.document.querySelectorAll("button.next").forEach(b => {
    b.addEventListener("click", nextBtnClick, false);
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
          const skip = e.getAttribute("data-skip");
          setTimeout(() => next(skip), 300);
        }, false)
      });
    }

    const masks = document.querySelectorAll("[data-mask]");

    if (masks.length) {
      let script = "";
      masks.forEach((el) => {
        const id = el.id;
        const mask = el.getAttribute("data-mask");
        // console.log(id, mask);
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

function buildPage({ startMsg, finishMessage, fullscreen, url, offline, response_url }) {
  const page = new JSDOM("<html><body></body></html>");
  const head = page.window.document.head;
  head.innerHTML = `<meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Form</title>
  <script src="https://unpkg.com/axios/dist/axios.min.js"></script>
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

  console.log(parsed);
  parsed.forEach((q, i) => {
    const questionEl = page.window.document.createElement("div");
    const questionConfig = getConfigs(q.title);
    console.log(questionConfig);
    questionEl.className = "question";
    let currQuestionEl = questionEl;
    if (questionConfig.samePage) {
      const prevQuestionEl = container.lastChild;
      currQuestionEl = prevQuestionEl;
      // delete exisisting button
      currQuestionEl.removeChild(prevQuestionEl.querySelector("button"));
      const questionSpacer = page.window.document.createElement("div");
      questionSpacer.className = "questionSpacer";
      currQuestionEl.appendChild(questionSpacer);
    }

    const title = page.window.document.createElement("p");
    title.innerHTML = q.title.split("//")[0].trim();
    title.className = "title";
    if (q.required) {
      if (!title.innerHTML.endsWith("*")) {
        title.innerHTML += " *";
      }
      title.innerHTML = title.innerHTML.replace(" *", "<span>*</span>");
    }
    currQuestionEl.appendChild(title);
    if (q.subtitle) {
      const subtitle = page.window.document.createElement("p");
      subtitle.className = "subtitle";
      subtitle.innerHTML = q.subtitle;
      currQuestionEl.appendChild(subtitle);
    }
    const question = buildQuestion(q);
    if (question) {
      currQuestionEl.appendChild(question);
    } else {
      const error = page.window.document.createElement("h1");
      error.innerHTML = "Erro ao carregar";
      currQuestionEl.appendChild(error);
    }
    if (fullscreen && i !== parsed.length - 1) {
      const btn = page.window.document.createElement("button");
      btn.innerHTML = "Próximo";
      btn.className = "next";
      currQuestionEl.appendChild(btn);
    } else if (i === parsed.length - 1) {
      const br = page.window.document.createElement("br");
      currQuestionEl.appendChild(br);
      const btn = page.window.document.createElement("button");
      btn.innerHTML = "Finalizar";
      btn.id = "send";
      currQuestionEl.appendChild(btn);
    }

    // if the question is the same page, we need to replace the last question
    if (questionConfig.samePage) {
      container.replaceChild(currQuestionEl, container.lastChild);
    } else {
      container.appendChild(currQuestionEl);
    }
  });

  if (!finishMessage.startsWith("http") && finishMessage) {
    const questionEl = page.window.document.createElement("div");
    questionEl.className = "question";
    const title = page.window.document.createElement("p");
    title.innerHTML = finishMessage;
    title.className = "title";
    const btn = page.window.document.createElement("button");
    btn.innerHTML = "Começar";
    questionEl.appendChild(title);
    container.appendChild(questionEl);
  }
  const scripts = buildLogic(
    parsed,
    response_url || url,
    finishMessage,
    fullscreen,
    startMsg,
    offline
  );
  const scriptEl = page.window.document.createElement("script");
  scriptEl.innerHTML = scripts;
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
    name: "response_url",
    message: "URL to send answers",
    default: "",
    validate: function (value) {
      if (!value) {
        return true;
      }
      const pass = value.match(urlRegex);
      if (pass) {
        return true;
      }

      return "Insert a valid URL";
    },
  },
  {
    type: "input",
    name: "startMsg",
    message: "Welcome message (optional)",
  },
  {
    type: "confirm",
    name: "fullscreen",
    default: true,
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
    name: "finishMessage",
    default: "Obrigado por responder!",
    message: "Redirecting URL OR message after form is submitted",
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

  const questions = dom.window.document.querySelectorAll("[data-params]");

  console.log("Parsing...");
  questions.forEach(readData);

  const page = buildPage(settings);
  const prettyHTML = pretty(page);
  fs.writeFileSync(settings.filename + ".html", prettyHTML);
  console.log("done");
}

run();
