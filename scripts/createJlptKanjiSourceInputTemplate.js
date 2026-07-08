const service = require("../src/services/jlptKanjiSourceInputTemplateCommandService");

if (require.main === module) {
    service.main();
}

module.exports = service;
