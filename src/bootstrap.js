
function log(msg) {
    Zotero.debug("Zotero S3 Sync: " + msg);
}

function install() {
    log("installed");
}
function uninstall() {
    log("uninstalled");
}
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
            secretAccessKey: prefs.getCharPref("secretAccessKey"),
            endpoint: prefs.getCharPref("endpoint")
    };

    //Zotero.Sync.Storage.Mode.push(new Zotero.Sync.Storage.Mode.S3(options));
    log("S3 Sync storage mode registered.");
    
}
