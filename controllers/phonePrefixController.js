const { phonePrefixes } = require("../config/phonePrefixes");

exports.list = (_req, res) => {
  const list = Object.entries(phonePrefixes).map(([value, cfg]) => ({
    value,
    label: cfg.label,
    placeholder: cfg.placeholder,
  }));
  res.json(list);
};