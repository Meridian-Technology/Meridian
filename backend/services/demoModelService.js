const demoManifestSchema = require('../schemas/demoManifest');
const demoCredentialSchema = require('../schemas/demoCredential');
const getModels = require('./getModelService');

function getDemoModels(db) {
    const req = { db };
    const core = getModels(
        req,
        'User',
        'Org',
        'OrgMember',
        'Event',
        'EventAgenda',
        'EventAnalytics',
        'EventJob',
        'VolunteerSignup',
        'EventEquipment',
        'Task'
    );

    const DemoManifest = db.models.DemoManifest || db.model('DemoManifest', demoManifestSchema);
    const DemoCredential = db.models.DemoCredential || db.model('DemoCredential', demoCredentialSchema);

    return { ...core, DemoManifest, DemoCredential };
}

module.exports = { getDemoModels };
