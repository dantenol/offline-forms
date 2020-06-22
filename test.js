const axios = require("axios");
const FormData = require("form-data");

const data = {
  "entry.468593976": "sadsda",
  "entry.1259068779": "dsadsa",
  "entry.1234420276": "",
};

const CORS_PROXY = "https://cors-anywhere.herokuapp.com/"

const formData = new FormData();
for (var key in data) {
  formData.append(key, data[key]);
}

axios
  .post(
    CORS_PROXY + "https://docs.google.com/forms/d/e/1FAIpQLSeve5BFjdD_w25M9cCrTLVuQh_oz8uG2TVwVB8cJzmE_uuLMQ/formResponse",
    data,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  )
  .then((r) => console.log(r))
  .catch((e) => console.log(e));
