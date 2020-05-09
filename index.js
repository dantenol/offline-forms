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

function buildQuestion(type, options, name) {
  switch (type) {
    case "text":
      return buildInput(name);
    case "textarea":
      return buildTextarea(name);
    case "radio":
      return buildMultipleChoice(name, options, "radio");
    case "checkbox":
      return buildMultipleChoice(name, options, "checkbox");
    case "select":
      return buildSelect(name, options);
    default:
      break;
  }
}

function buildInput(name) {
  const q = new JSDOM("<input />");
  const el = q.window.document.querySelector("input");
  el.type = "text";
  el.name = name;
  el.id = /\d+/g.exec(name);
  el.placeholder = "Digite aqui...";
  return el;
}

function buildTextarea(name) {
  const q = new JSDOM("<textarea />");
  const el = q.window.document.querySelector("textarea");
  el.name = name;
  el.id = /\d+/g.exec(name);
  el.placeholder = "Digite aqui...";
  return el;
}

function buildMultipleChoice(name, options, type) {
  const q = new JSDOM("<div class='multipleChoiceContainer' />");
  const el = q.window.document.querySelector("div");
  options.forEach((o) => {
    const inp = q.window.document.createElement("input");
    const label = q.window.document.createElement("label");
    inp.type = type;
    inp.value = o;
    inp.name = name;
    inp.id = "" + /\d+/g.exec(name) + "." + o;
    label.htmlFor = "" + /\d+/g.exec(name) + "." + o;
    label.innerHTML = o;
    el.appendChild(inp);
    el.appendChild(label);
  });
  return el;
}

function buildSelect(name, options) {
  const q = new JSDOM("<select />");
  const el = q.window.document.querySelector("select");
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

function buildLogic(questions, formURL, finishURL, fullscreen) {
  let script = "";
  script += `let step = 0;
  const height = window.document.documentElement.clientHeight;
  function next() {
    const mask = questionRegex[step];
    if (
      mask &&
      !mask.test(document.getElementById(questionNames[step]).value)
    ) {
      alert("O campo é obrigatório!");
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
    const structure = ${JSON.stringify(parsed)};
    Object.keys(data).forEach((entry, i) => {
      console.log(structure[i].required, data[entry]);
      if (structure[i].required && !data[entry]) {
        highlightRequired(entry);
        throw "Campo obrigatório";
      }
    });
  }

  function highlightRequired(name) {
    console.log(name);
    document.getElementsByName(name).forEach((e) => {
      e.style.border = "2px solid red";
    })
  }

  async function send() {
    const data = formatObj();
    checkData();
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

  window.document.querySelectorAll("button.next").forEach(b => {
    b.addEventListener("click", next, false);
  });

  window.document.getElementById("send").addEventListener("click", send, false);
  `;

  if (fullscreen) {
    script += `
    window.addEventListener("load", function () {
      const els = document.querySelectorAll("input");
      els.forEach((e) =>
        e.addEventListener("keypress", function (e) {
          if (e.key === "Enter") {
            next();
          }
        })
      );
    });`;
  }

  return script;
}

function buildPage({ startMsg, finishURL, fullscreen, url }) {
  const page = new JSDOM("<html><body></body></html>");
  const container = page.window.document.createElement("div");
  container.id = "formContainer";
  page.window.document.body.appendChild(container);
  if (startMsg) {
    const questionEl = page.window.document.createElement("div");
    questionEl.className = "question";
    const title = page.window.document.createElement("p");
    title.innerHTML = startMsg;
    title.className = "title";
    if (fullscreen) {
      const btn = page.window.document.createElement("button");
      btn.innerHTML = "Começar";
      btn.onclick = "next()";
      questionEl.appendChild(btn);
    }
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
    const question = buildQuestion(q.type, q.options, q.name);
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
      const btn = page.window.document.createElement("button");
      btn.innerHTML = "Finalizar";
      btn.id = "send";
      questionEl.appendChild(btn);
    }
    container.appendChild(questionEl);
  });

  const scripts = buildLogic(parsed, url, finishURL, fullscreen);
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
    message: "Digite a URL do Google form",
    validate: function (value) {
      var pass = value.match(urlRegex);
      if (pass) {
        return true;
      }

      return "Digite uma URL válida";
    },
  },
  {
    type: "input",
    name: "startMsg",
    message: "Digite a mensagem de início (opcional)",
  },
  {
    type: "confirm",
    name: "fullscreen",
    default: false,
    message: "Exibir uma pergunta por vez? (estilo typeform)",
  },
  {
    type: "input",
    name: "finishURL",
    default: "#",
    message:
      "Digite URL para ser redirecionada após o preenchimento (opcional)",
  },
  {
    type: "input",
    name: "filename",
    message: "Como deseja salvar? (.html)",
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
