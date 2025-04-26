/*
    ***** BEGIN LICENSE BLOCK *****

    Adapted from Zotero WebDAV Sync Code
    Now supporting Amazon S3 (pure fetch + AWS SigV4), including local S3-compatible endpoints

    ***** END LICENSE BLOCK *****
*/


ZoteroS3 = {
    id: null,
    version: null,
    rootURI: null,
    initialized: false,
    addedElementIDs: [],

    init({ id, version, rootURI }) {
        if (this.initialized) return;
        this.id = id;
        this.version = version;
        this.rootURI = rootURI;
        this.initialized = true;
    },

    log(msg) {
        Zotero.debug("ZoteroOCR: " + msg);
    },

    addToWindow(window) {
        let doc = window.document;

        // Use Fluent for localization
        window.MozXULElement.insertFTLIfNeeded("zotero-s3.ftl");

        // Add menu option
        let menuitem = doc.createXULElement('menuitem');
        menuitem.id = 'zotero-s3-item-menu';
        menuitem.class = 'menuitem-iconic zotero-menuitem-s3'
        menuitem.setAttribute('data-l10n-id', 's3-sync-selected-item');
        doc.getElementById('zotero-itemmenu').appendChild(menuitem);
        menuitem.addEventListener('command', () => {
            ZoteroS3.sync(window);
        });
        this.storeAddedElement(menuitem);
    },

    addToAllWindows() {
        var windows = Zotero.getMainWindows();
        for (let win of windows) {
            if (!win.ZoteroPane) continue;
            this.addToWindow(win);
        }
    },

    storeAddedElement(elem) {
        if (!elem.id) {
            throw new Error("Element must have an id");
        }
        this.addedElementIDs.push(elem.id);
    },

    removeFromWindow(window) {
        var doc = window.document;
        // Remove all elements added to DOM
        for (let id of this.addedElementIDs) {
            doc.getElementById(id)?.remove();
        }
        doc.querySelector('[href="zotero-ocr.ftl"]').remove();
    },

    removeFromAllWindows() {
        var windows = Zotero.getMainWindows();
        for (let win of windows) {
            if (!win.ZoteroPane) continue;
            this.removeFromWindow(win);
        }
    },

    sync(window) {
        Zotero.debug("entering sync()");
    }
}

if (!Zotero.Sync.Storage.Mode) {
    Zotero.Sync.Storage.Mode = {};
}

Zotero.Sync.Storage.Mode.S3 = function (options) {
    this.options = options;

    this.bucket = options.bucket;
    this.region = options.region;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.endpoint = options.endpoint || null; // Support local S3 endpoints

    this.VerificationError = function (error, key) {
        this.message = `S3 verification error (${error})`;
        this.error = error;
        this.key = key;
    }
    this.VerificationError.prototype = Object.create(Error.prototype);
}

Zotero.Sync.Storage.Mode.S3.prototype = {
    mode: "s3",
    name: "Amazon S3",

    async putFile(key, content) {
        const url = this._getURL(key);
        const headers = await this._signRequest("PUT", key, content);
        try {
            const res = await fetch(url, {
                method: "PUT",
                headers,
                body: content
            });
            if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        } catch (e) {
            throw new this.VerificationError(e, key);
        }
    },

    async getFile(key) {
        const url = this._getURL(key);
        const headers = await this._signRequest("GET", key);
        try {
            const res = await fetch(url, {
                method: "GET",
                headers
            });
            if (!res.ok) throw new Error(`Download failed: ${res.status}`);
            return await res.text();
        } catch (e) {
            throw new this.VerificationError(e, key);
        }
    },

    async deleteFile(key) {
        const url = this._getURL(key);
        const headers = await this._signRequest("DELETE", key);
        try {
            const res = await fetch(url, {
                method: "DELETE",
                headers
            });
            if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
        } catch (e) {
            throw new this.VerificationError(e, key);
        }
    },

    async fileExists(key) {
        const url = this._getURL(key);
        const headers = await this._signRequest("HEAD", key);
        try {
            const res = await fetch(url, {
                method: "HEAD",
                headers
            });
            return res.ok;
        } catch (e) {
            if (e.name === 'NotFound') return false;
            throw new this.VerificationError(e, key);
        }
    },

    _getURL(key) {
        if (this.endpoint) {
            return `${this.endpoint}/${this.bucket}/${encodeURIComponent(key)}`;
        }
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodeURIComponent(key)}`;
    },

    async _signRequest(method, key, body = "") {
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\..*/g, '') + 'Z';
        const dateStamp = amzDate.substring(0, 8);

        const host = this.endpoint ? new URL(this.endpoint).host : `${this.bucket}.s3.${this.region}.amazonaws.com`;
        const canonicalUri = this.endpoint ? `/${this.bucket}/${encodeURIComponent(key)}` : `/${encodeURIComponent(key)}`;

        const payloadHash = await this._sha256(body);

        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
        const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

        const canonicalRequest = [
            method,
            canonicalUri,
            "",
            canonicalHeaders,
            signedHeaders,
            payloadHash
        ].join("\n");

        const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
        const stringToSign = [
            "AWS4-HMAC-SHA256",
            amzDate,
            credentialScope,
            await this._sha256(canonicalRequest)
        ].join("\n");

        const signingKey = await this._getSignatureKey(this.secretAccessKey, dateStamp, this.region, "s3");
        const signature = await this._hmacHex(signingKey, stringToSign);

        const authorizationHeader =
            `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, ` +
            `SignedHeaders=${signedHeaders}, Signature=${signature}`;

        return {
            "x-amz-date": amzDate,
            "x-amz-content-sha256": payloadHash,
            "Authorization": authorizationHeader
        };
    },

    async _sha256(msg) {
        const enc = new TextEncoder();
        const data = typeof msg === "string" ? enc.encode(msg) : msg;
        const hash = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    async _hmac(key, str) {
        const enc = new TextEncoder();
        const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        return await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(str));
    },

    async _hmacHex(key, str) {
        const raw = await this._hmac(key, str);
        return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    async _getSignatureKey(key, dateStamp, regionName, serviceName) {
        const kDate = await this._hmac(new TextEncoder().encode("AWS4" + key), dateStamp);
        const kRegion = await this._hmac(kDate, regionName);
        const kService = await this._hmac(kRegion, serviceName);
        const kSigning = await this._hmac(kService, "aws4_request");
        return kSigning;
    }
};
