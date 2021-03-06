(function () {
    window.createCreativeStore = function () {
        return {
            listeners: [],
            newCreativeListeners: [],
            creatives: [],
            defaultClickUrl: 'http://',
            key: 0,
            showingInvalid: false,
            endpoint: '',
            maxFileSize: 40,
            showDefault: false,

            setMaxFileSize: function (sizeInBytes) {
                this.maxFileSize = sizeInBytes;
            },

            addChangeListener: function (listener) {
                this.listeners.push(listener);
            },

            notifyListeners: function () {
                _.each(this.listeners, function (listener) { listener(); });
            },

            addNewCreativesListener: function (listener) {
                this.newCreativeListeners.push(listener);
            },

            notifyNewCreatives: function (creatives) {
                _.each(this.newCreativeListeners, function (listener) { listener(creatives); });
            },

            setValidSizes: function (sizes) {
                this.validSizes = sizes;
            },

            setCreativesEndpoint: function (url) {
                this.endpoint = url;
            },

            setDefaultClickUrl: function (url) {
                var self = this;
                this.defaultClickUrl = url;

                // Revalidate all creatives that use the default clickUrl
                _.each(this.creatives ,function (creative) {
                    if (!creative.clickUrl || creative.clickUrl === '') {
                        self.validate(creative);
                    }
                });

                this.notifyListeners();
            },

            empty: function () {
                this.creatives = [];
                this.notifyListeners();
            },

            handleUpload: function (input) {
                if (!!window.FileReader && !!window.FormData) {
                    for (i = 0; i < input.files.length; i++) {
                        this.addFile(input.files[i]);
                    }
                }
                else {
                    this.uploadUsingIframe(input);
                }
            },

            addFile: function (file) {
                var reader = new FileReader();
                var image = new Image();
                var self = this;

                if (file.size > 120 * 1024) {
                    this.add({
                        type: 'image',
                        content_type: 'file',
                        clickUrl: '',
                        filename: file.name,
                        filesize: file.size,
                        size: 'Unknown',
                        url: self.getPlaceholder()
                    });

                    return;
                }

                reader.onload = function(upload) {
                    image.src    = upload.target.result;
                    image.onload = function () {
                        self.add({
                            type: 'image',
                            content_type: 'file',
                            clickUrl: '',
                            filename: file.name,
                            filesize: file.size,
                            size: this.width + 'x' + this.height,
                            url: upload.target.result,
                        });
                    };
                }.bind(this);

                reader.readAsDataURL(file);
            },

            uploadUsingIframe: function(fileInput) {

                var random = _.random(10000000, 999999999);
                var self = this;

                fileInput = $(fileInput);

                var newInput = fileInput.clone();

                fileInput.replaceWith(newInput);

                var form = $('<form></form>', {
                    'class': 'transport',
                    // TODO: Use the actual local base64 encoder
                    action: '/base64.php',
                    method: 'POST',
                    enctype: 'multipart/form-data',
                    encoding: 'multipart/form-data',
                    target: 'uploadiframe' + random
                }).append(fileInput).appendTo($(document.body));

                var ifm = $('<iframe name="uploadiframe' + random + '"></iframe>').appendTo(form).load(function() {
                    var res;

                    try {
                        res = $.parseJSON(this.contentWindow.response);
                    } catch(e) {
                        res = { error: 'Unknown error.' };
                    }

                    if (res !== null && !res.error) {

                        for (var i = 0; i < res.files.length; i++) {
                            file = res.files[i];

                            if (file.state === 'invalid') {
                                errFile = {
                                    type: 'image',
                                    content_type: 'file',
                                    clickUrl: '',
                                    filename: file.name,
                                    filesize: file.filesize,
                                    size: 'Unknown',
                                    url: self.getPlaceholder()
                                };
                                self.setInvalid(errFile);

                                self.add(errFile);
                            }
                            else {
                                self.add({
                                    content_type: 'file',
                                    clickUrl: '',
                                    filename: file.name,
                                    filesize: file.filesize,
                                    size: file.size,
                                    url: file.data
                                });
                            }

                        }
                    }

                    form.remove();
                });

                form.submit();
            },

            add: function (creative) {
                creative.id = this.key++;

                this.validate(creative);

                if (creative.content_type == 'file') {
                    this.showDefault = true;

                    if (!this.isValidSize(creative.size)) {
                        creative.permanentlyInvalid = true;
                    }

                    if (creative.filesize > this.maxFileSize) {
                        creative.permanentlyInvalid = true;
                        this.setInvalid(creative, 'Creative filesize too large, max ' + this.getHumanFileSize(this.maxFileSize)  + '!');
                    }

                    creative.filesize = this.getHumanFileSize(creative.filesize);
                }

                this.creatives.push(creative);

                this.notifyListeners();
            },

            update: function (id, creative) {
                var index = this.find(id);
                var source = this.creatives[index];

                _.extend(source, creative);

                this.validate(source);

                this.notifyListeners();
            },

            remove: function (id) {
                this.showDefault = false;
                var index = this.find(id);
                
                if (index !== -1) {
                    this.creatives.splice(index, 1);
                }
                for (var i = 0; i < this.creatives.length; i++) {
                    if (this.creatives[i].content_type == 'file') {
                        this.showDefault = true;
                    }
                }

                this.notifyListeners();
            },

            find: function (id) {
                return _.findIndex(this.creatives, function (c) { return c.id === id; });
            },

            validate: function (creative) {
                if (creative.type !== 'popup' && !this.isValidSize(creative.size)) {
                    this.setInvalid(creative, 'Incorrect creative dimensions!');
                    return;
                }

                if ((creative.content_type !== 'file' && creative.content_type !== 'content') && !this.isValidUrl(creative.url)) {
                    this.setInvalid(creative, 'Incorrect URL set!');
                    return;
                }

                if (creative.content_type === 'file') {
                    var url = (!creative.clickUrl || creative.clickUrl === '') ? this.defaultClickUrl : creative.clickUrl;

                    if (!this.isValidUrl(url)) {
                        this.setInvalid(creative, 'Incorrect URL set!');
                        return;
                    }
                }

                if (creative.content_type === 'content') {
                    if (!creative.content || creative.content === '') {
                        this.setInvalid(creative, 'The content of the creative is empty');
                        return;
                    }
                }

                delete creative.state;
                delete creative.reason;
            },

            isValidUrl: function (url) {
                return /^https?:\/\/.+/.test(url);
            },

            isValidSize: function (size) {
                return _.indexOf(this.validSizes, size) !== -1;
            },

            hasOnlyValidCreatives: function () {
                // permanentlyInvalid are ignored
                return _.every(this.creatives, function (creative) {
                    return (creative.permanentlyInvalid || creative.state !== 'invalid');
                });
            },

            // Used before submitting but still contains invalid creatives
            showInvalidCreatives: function (creative) {
                this.showingInvalid = true;

                this.notifyListeners();
            },

            removeInvalidImageCreatives: function () {
                this.creatives = _.filter(this.creatives, function (creative) {
                    return !creative.permanentlyInvalid;
                });

                this.notifyListeners();
            },

            getValidCreatives: function () {
                var creatives = this.getState().creatives;

                return _.filter(creatives, function (creative) {
                    return creative.state != 'invalid';
                });
            },

            getState: function () {
                var url = this.defaultClickUrl;
                var self = this;

                var creatives = _.map(this.creatives, function (c) {
                    c.showErrors = self.showingInvalid;

                    if (c.content_type == 'file' && (!c.clickUrl || c.clickUrl === '')) {
                        var newc = _.clone(c);
                        newc.clickUrl = url;

                        return newc;
                    }

                    return c;
                });

                return { creatives: creatives };
            },

            setInvalid: function (creative, reason) {
                creative.state  = 'invalid';
                creative.reason = reason;
            },

            getHumanFileSize: function (fileSizeInBytes) {
                var i = -1;
                var byteUnits = [' KB', ' MB', ' GB'];
                do {
                    fileSizeInBytes = fileSizeInBytes / 1024;
                    i++;
                } while (fileSizeInBytes > 1024);

                return Math.max(fileSizeInBytes, 0.1).toFixed(1) + byteUnits[i];
            },

            getPlaceholder: function () {
                return '/img/creatives/placeholder.png';
            },

            transformForApi: function (ocreative) {
                creative = _.clone(ocreative);

                if (creative.content_type === 'file') {
                    creative.base64 = creative.url.substr(creative.url.indexOf(',')+1);
                    creative.url = creative.clickUrl && creative.clickUrl !== '' ? creative.clickUrl : self.defaultClickUrl;

                    delete creative.clickUrl;
                }

                if (creative.type == 'javascript') {
                    creative.type = 'js';
                }

                var sizes = creative.size.split('x');
                creative.width = sizes[0];
                creative.height = sizes[1];

                delete creative.size;
                delete creative.filesize;
                delete creative.showErrors;

                return creative;
            },

            postToBackend: function (creatives) {
                var self = this;

                $.ajax({
                    type: 'POST',
                    url: this.endpoint,
                    data: {creatives: creatives},
                    success: function (data) {
                        self.successResponse(data);
                    },
                    failed: function (e) {
                        alert('Error: We could not upload the creatives! Please contact support.' + e.message);
                    }
                });
            },

            successResponse: function (data) {
                var newCreatives = [];

                for (var i = 0, j = 0; i < data.length; i++, j++) {
                    if (data[i].status === 'success') {
                        newCreatives.push(data[i]);
                        this.creatives.splice(j, 1);
                        --j;
                    }
                    else {
                        this.showErrors = true;

                        var errors = _.flatten(_.values(data[i].errors));
                        this.setInvalid(this.creatives[j], errors[0]);

                        if (this.creatives[j].content_type === 'file') {
                            this.creatives[j].permanentlyInvalid = true;
                        }
                    }
                }

                this.notifyListeners();
                this.notifyNewCreatives(newCreatives);
            },

            uploadCreatives: function () {
                this.removeInvalidImageCreatives();
                var self = this;

                if (!this.hasOnlyValidCreatives()) {
                    this.showInvalidCreatives();
                } else {
                    var creatives = _.map(this.getState().creatives, function (creative) {
                        return self.transformForApi(creative);
                    });

                    if (creatives.length > 0) {
                        this.postToBackend(creatives);
                        this.showInvalidCreatives();
                    }
                }
            }
        };
    };
})();
