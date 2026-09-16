/* ============================================
   API.JS — Network Communication Layer
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const API = (() => {
    const BASE_URL = '/api';

    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;


        const headers = { ...options.headers };
        if (!(options.body instanceof FormData) && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(url, { ...options, headers });

            let data;

            try { data = await response.json(); } catch (e) { data = null; }

            if (!response.ok) {
                const errorMsg = data?.error || data?.message || response.statusText || 'Unknown Error';
                throw new Error(errorMsg);
            }

            return data;
        } catch (error) {

            if (window.AFM && window.AFM.Toast) {
                window.AFM.Toast.error('Network Error', error.message || 'Failed to communicate with server');
            }
            throw error;
        }
    }


    const get = (endpoint) => request(endpoint, { method: 'GET' });

    const post = (endpoint, body) => request(endpoint, {
        method: 'POST',
        body: body instanceof FormData ? body : JSON.stringify(body)
    });

    const put = (endpoint, body) => request(endpoint, {
        method: 'PUT',
        body: body instanceof FormData ? body : JSON.stringify(body)
    });

    const del = (endpoint, body) => request(endpoint, {
        method: 'DELETE',
        body: body ? JSON.stringify(body) : undefined
    });

    const upload = (endpoint, formData, onProgress) => {
        const xhr = new XMLHttpRequest();
        const url = `${BASE_URL}${endpoint}`;

        const promise = new Promise((resolve, reject) => {
            xhr.open('POST', url);

            if (xhr.upload && onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        onProgress(e.loaded, e.total);
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        resolve(xhr.responseText);
                    }
                } else {
                    reject(new Error(xhr.responseText || xhr.statusText));
                }
            };

            xhr.onerror = () => reject(new Error('Upload failed due to network error'));
            xhr.onabort = () => reject(new Error('Upload cancelled'));

            xhr.send(formData);
        });

        return {
            promise,
            abort: () => xhr.abort()
        };
    };

    return { get, post, put, del, upload, BASE_URL };
})();

window.API = API;