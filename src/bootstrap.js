var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

function install() {
    log("S3 plugin installed");
}
function uninstall() {}
function shutdown() {}

async function startup({id, version, rootURI}) {

    Zotero.PreferencePanes.register({
                image: 'chrome/skin/amazon-s3.svg',
                pluginID: 'zotero-s3@library.epfl.ch',
                src: rootURI + 'prefs.xhtml'
        });

    
        Services.scriptloader.loadSubScript(rootURI + "s3.js");

        const prefs = Services.prefs.getBranch("extensions.zotero-s3-sync.");
        let options = {
            bucket: prefs.getCharPref("bucket"),
            region: prefs.getCharPref("region"),
            accessKeyId: prefs.getCharPref("accessKeyId"),
            secretAccessKey: prefs.getCharPref("secretAccessKey")
        };

        Zotero.Sync.Storage.MODES.push(new Zotero.Sync.Storage.Mode.S3(options));
        Zotero.debug("S3 Sync storage mode registered.");
    
}
