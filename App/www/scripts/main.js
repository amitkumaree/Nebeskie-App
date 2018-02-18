/* Framework7 Initialization */
var myApp = new Framework7({
    dynamicNavbar: true,
    sortable: false,
    swipeout: false,
    swipeBackPageAnimateShadow: false,
    fastClicks: true,
    swipePanel: 'left',
    swipeBackPageAnimateOpacity: false,
    notificationHold: 3000,
    tapHold: true,
    material: true,
    precompileTemplates: true
});
var $$ = Dom7;

/* Environment */
//test
var produrl = "https://vrx1l75igg.execute-api.us-east-1.amazonaws.com/test/";
//var produrl = '';

/* Global Parameters */
var shadowStatus = null;
var hubStatus = null;
var jwtToken;
var userData;

/*Template7 Parameters*/
var home;
var homeTemplate;
var headerTemplate;
var paneltemplate;
var homeList;
var roomList;
var deviceList;

/* Device and Home Configuration */
// Status Mapping
var devicesElement = null;
var desired = {};
$$('body').on('change', 'input[id^="SLB"]', function () {
    desired = {};
    for (var d in shadowStatus.state.reported) {
        if (d == $$(this).attr('id')) {
            if ($$(this).prop('checked')) {
                console.log($$(this).attr('id') + ': on');
                shadowStatus.state.reported[d] = 'on';
                desired[d] = 'on';
            }
            else {
                console.log($$(this).attr('id') + ': off');
                shadowStatus.state.reported[d] = 'off';
                desired[d] = 'off';
            }
            putShadow();
        }
    };
});
var initDeviceMapping = function (deviceStatus) {
    devicesElement = $$('input[id^="SLB"]');
    for (var i = 0; i < devicesElement.length; i++) {
        for (var d in deviceStatus) {
            if (d == devicesElement[i].id) {
                console.log(d + ' : ' + deviceStatus[d]);
                if (deviceStatus[d] == 'on') {
                    devicesElement[i].checked = true;
                }
                else {
                    devicesElement[i].checked = false;
                }
            }
        }
    }
};

// Network Events

document.addEventListener("online", onOnline, false);
function onOnline() {
    // Handle the online event
    connectMQTT();
}

// Utilities to do sigv4 @class SigV4Utils

function SigV4Utils() { }

SigV4Utils.sign = function (key, msg) {
    var hash = CryptoJS.HmacSHA256(msg, key);
    return hash.toString(CryptoJS.enc.Hex);
};
SigV4Utils.sha256 = function (msg) {
    var hash = CryptoJS.SHA256(msg);
    return hash.toString(CryptoJS.enc.Hex);
};
SigV4Utils.getSignatureKey = function (key, dateStamp, regionName, serviceName) {
    var kDate = CryptoJS.HmacSHA256(dateStamp, 'AWS4' + key);
    var kRegion = CryptoJS.HmacSHA256(regionName, kDate);
    var kService = CryptoJS.HmacSHA256(serviceName, kRegion);
    var kSigning = CryptoJS.HmacSHA256('aws4_request', kService);
    return kSigning;
};

// MQTT Connect and Subscribe

var connected = false;
var mqttClient = null;

var connectMQTT = function () {

    var time = moment.utc();
    var dateStamp = time.format('YYYYMMDD');
    var amzdate = dateStamp + 'T' + time.format('HHmmss') + 'Z';
    var service = 'iotdevicegateway';
    var region = 'us-west-2';
    var algorithm = 'AWS4-HMAC-SHA256';
    var credentialScope = dateStamp + '/' + region + '/' + service + '/' + 'aws4_request';
    var host = "a3p37nu3y6lf1t.iot.us-west-2.amazonaws.com";
    var canonicalUri = '/mqtt';

    var canonicalQuerystring = "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAJSFL77NUNJUMKSYA%2F20170710%2Fus-west-2%2Fiotdevicegateway%2Faws4_request" + '&X-Amz-Date=' + amzdate + "&X-Amz-Expires=86400&X-Amz-SignedHeaders=host";

    var canonicalHeaders = 'host:' + host + '\n';
    var payloadHash = SigV4Utils.sha256('');
    var canonicalRequest = "GET" + '\n' + canonicalUri + '\n' + canonicalQuerystring + '\n' + canonicalHeaders + '\nhost\n' + payloadHash;

    var stringToSign = algorithm + '\n' + amzdate + '\n' + credentialScope + '\n' + SigV4Utils.sha256(canonicalRequest);
    var signingKey = SigV4Utils.getSignatureKey('Zv5S9TWVsw8LpjtTQwWfwVAOCKAurLwmuENqCgkI', dateStamp, region, service);
    var signature = SigV4Utils.sign(signingKey, stringToSign);
    canonicalQuerystring += '&X-Amz-Signature=' + signature;

    var endpoint = 'wss://' + host + canonicalUri + '?' + canonicalQuerystring;

    var clientId = amzdate;
    mqttClient = new Paho.MQTT.Client(endpoint, clientId);

    mqttClient.onConnectionLost = function () {
        //alert('lost');
        connected = false;
        console.log('got disconnected');
        if (navigator.connection.type != Connection.NONE || navigator.connection.type != Connection.UNKNOWN || navigator.connection.type != Connection.CELL || navigator.connection.type != Connection.CELL_2G) {
            connectMQTT();
        }
    };
    mqttClient.onMessageArrived = function (msg) {
        var obj = JSON.parse(msg.payloadString);
        if (obj.state.reported != null) {
            console.log('update Payload');
            myApp.showIndicator();
            shadowStatus.state.reported[Object.keys(obj.state.reported)[0]] = obj.state.reported[Object.keys(obj.state.reported)[0]];
            initDeviceMapping(shadowStatus.state.reported);
            myApp.hideIndicator();
        }
    };

    var connectOptions = {
        onSuccess: function () {
            connected = true;
            subscribeMQTT();
            console.log('connected');
        },
        useSSL: true,
        timeout: 3,
        mqttVersion: 4,
        onFailure: function () {
            connected = false;
            console.log('connectionLost');
            //connectMQTT();
        }
    };
    mqttClient.connect(connectOptions);
};
var subscribeMQTT = function () {
    var topic = "$aws/things/myraspberrypi/shadow/update/accepted";
    try {
        mqttClient.subscribe(topic, {
            onSuccess: function () {
                console.log('subscribeSucess');
            },
            onFailure: function () {
                console.log('subscribeFailed');

            }
        });
    } catch (e) {
        console.log('subscribeFailed', e);
    }
};

// Get shadow and home
var version;
var getShadow = function () {
    $$.ajax({
        url: produrl + 'shadow/myraspberrypi',
        method: 'GET',
        headers: {
            'Authorization': jwtToken
        },
        success: function (data, status, xhr) {
            data = JSON.parse(data);
            shadowStatus = { state: { reported: data.state.reported }, version: data.version };
            version = data.version;
            initDeviceMapping(shadowStatus.state.reported);
            myApp.hidePreloader();
            myApp.hideIndicator();
            myApp.pullToRefreshDone();
            //console.log(shadowStatus);
        },
        error: function (xhr, status) {
            myApp.hidePreloader();
            myApp.pullToRefreshDone();
            myApp.hideIndicator();
            if (status == 401) {
                if (localStorage.getItem("loginData") != null) {
                    postRefreshToken("getShadow()");
                }
                else {
                    localStorage.removeItem('loginData');
                    myApp.popup('.popup-login');
                }
            }
            else {
                myApp.addNotification({
                    title: 'EarthHome',
                    message: 'Network timeout.',
                    media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
                });
            }
        }
    });
};
var getHub = function () {
    $$.ajax({
        url: produrl + 'myHubs',
        method: 'GET',
        headers: {
            'Authorization': jwtToken
        },
        success: function (data, status, xhr) {
            data = JSON.parse(data);
            home = { hub: data[0] };
            getShadow();
            homeTemplate = Template7.templates.roomsTemplate(home);
            document.getElementById('insertTemplate').innerHTML = homeTemplate;

            headerTemplate = Template7.templates.headerTemplate(home);
            document.getElementById('insertheader').innerHTML = headerTemplate;

            paneltemplate = Template7.templates.panelTemplate(home);
            document.getElementById('insertPanel').innerHTML = paneltemplate;

            $$('.hub-name').text(home.hub.homeName);
            console.log(home);
        },
        error: function (xhr, status) {
            if (status == 401) {
                if (localStorage.getItem("loginData") != null) {
                    postRefreshToken("getHub()");
                }
                else {
                    myApp.hidePreloader();
                    myApp.pullToRefreshDone();
                    myApp.hideIndicator();
                    localStorage.removeItem('loginData');
                    myApp.popup('.popup-login');
                }
            }
            else {
                myApp.hidePreloader();
                myApp.pullToRefreshDone();
                myApp.hideIndicator();
                myApp.addNotification({
                    title: 'EarthHome',
                    message: 'Network timeout.',
                    media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
                });
            }
        }
    });
};
// Put shadow and home
var putShadow = function () {
    myApp.showIndicator();
    var publishObj = { state: { desired: desired } };
    $$.ajax({
        url: produrl + 'shadow/myraspberrypi',
        method: 'PUT',
        headers: {
            'Authorization': jwtToken,
            'Content-Type': 'application/json'
        },
        processData: false,
        data: JSON.stringify(publishObj),
        success: function (data, status, xhr) {
            data = JSON.parse(data);
            //shadowStatus = { state: { reported: data.state.reported, old: JSON.parse(JSON.stringify(data.state.reported)) }, version: data.version };
            //version = data.version;
            //initDeviceMapping(shadowStatus.state.reported);
            myApp.hideIndicator();
            //window.setTimeout(function () {
            //    getShadow();
            //}, 400);
        },
        error: function (xhr, status) {
            if (status == 401) {
                if (localStorage.getItem("loginData") != null) {
                    postRefreshToken("putShadow()");
                }
                else {
                    myApp.hideIndicator();
                    localStorage.removeItem('loginData');
                    myApp.popup('.popup-login');
                }
            }
            else {
                myApp.hideIndicator();
                myApp.addNotification({
                    title: 'EarthHome',
                    message: 'Network timeout.',
                    media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
                });
            }
        }
    });
};
var putDevice = function (id, name, type) {
    myApp.showIndicator();
    var load = {
        deviceName: name,
        deviceType: type
    };
    $$.ajax({
        url: produrl + 'deviceLoad/' + id,
        method: 'PUT',
        headers: {
            'Authorization': jwtToken,
            'Content-Type': 'application/json'
        },
        processData: false,
        data: JSON.stringify(load),
        success: function (data, status, xhr) {
            for (var i = 0; i < home.hub.rooms.length; i++) {
                for (var j = 0; j < home.hub.rooms[i].devices.length; j++) {
                    if (home.hub.rooms[i].devices[j].id == id) {
                        home.hub.rooms[i].devices[j].deviceName = name;
                        home.hub.rooms[i].devices[j].deviceType = type;
                        homeTemplate = Template7.templates.roomsTemplate(home);
                        document.getElementById('insertTemplate').innerHTML = homeTemplate;
                        headerTemplate = Template7.templates.headerTemplate(home);
                        document.getElementById('insertheader').innerHTML = headerTemplate;
                    }
                }
            }
            dashboardView.router.back();
            myApp.hideIndicator();
        },
        error: function (xhr, status) {
            if (status == 401) {
                if (localStorage.getItem("loginData") != null) {
                    postRefreshToken("putDevice()", id, name, type);
                }
                else {
                    myApp.hideIndicator();
                    localStorage.removeItem('loginData');
                    myApp.popup('.popup-login');
                }
            }
            else {
                myApp.hideIndicator();
                myApp.addNotification({
                    title: 'EarthHome',
                    message: 'Network timeout.',
                    media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
                });
            }
        }
    });
};
var putHub = function (id, name) {
    myApp.showIndicator();
    var load = {
        homeName: name
    };
    $$.ajax({
        url: produrl + 'hub/' + id,
        method: 'PUT',
        headers: {
            'Authorization': jwtToken,
            'Content-Type': 'application/json'
        },
        processData: false,
        data: JSON.stringify(load),
        success: function (data, status, xhr) {
            //data = JSON.parse(data);
            home.hub.homeName = name;

            homeTemplate = Template7.templates.roomsTemplate(home);
            document.getElementById('insertTemplate').innerHTML = homeTemplate;

            headerTemplate = Template7.templates.headerTemplate(home);
            document.getElementById('insertheader').innerHTML = headerTemplate;

            paneltemplate = Template7.templates.panelTemplate(home);
            document.getElementById('insertPanel').innerHTML = paneltemplate;

            $$('.hub-name').text(home.hub.homeName);
            dashboardView.router.back();
            myApp.hideIndicator();
        },
        error: function (xhr, status) {
            if (status == 401) {
                if (localStorage.getItem("loginData") != null) {
                    postRefreshToken("putHub()", id, name);
                }
                else {
                    myApp.hideIndicator();
                    localStorage.removeItem('loginData');
                    myApp.popup('.popup-login');
                }
            }
            else {
                myApp.hideIndicator();
                myApp.addNotification({
                    title: 'EarthHome',
                    message: 'Network timeout.',
                    media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
                });
            }
        }
    });
};
var putRoom = function (id, name) {
    myApp.showIndicator();
    var load = {
        name: name
    };
    $$.ajax({
        url: produrl + 'room/' + id,
        method: 'PUT',
        headers: {
            'Authorization': jwtToken,
            'Content-Type': 'application/json'
        },
        processData: false,
        data: JSON.stringify(load),
        success: function (data, status, xhr) {
            data = JSON.parse(data);
            //home.hub.homeName = name;

            for (var i = 0; i < home.hub.rooms.length; i++) {
                if (home.hub.rooms[i].id == id) {
                    home.hub.rooms[i].name = name;
                    homeTemplate = Template7.templates.roomsTemplate(home);
                    document.getElementById('insertTemplate').innerHTML = homeTemplate;
                    headerTemplate = Template7.templates.headerTemplate(home);
                    //document.getElementById('insertheader').innerHTML = headerTemplate;
                    //paneltemplate = Template7.templates.panelTemplate(home);
                    //document.getElementById('insertPanel').innerHTML = paneltemplate;
                }
            }
            dashboardView.router.back();
            myApp.hideIndicator();
        },
        error: function (xhr, status) {
            if (status == 401) {
                if (localStorage.getItem("loginData") != null) {
                    postRefreshToken("putRoom()", id, name);
                }
                else {
                    myApp.hideIndicator();
                    localStorage.removeItem('loginData');
                    myApp.popup('.popup-login');
                }
            }
            else {
                myApp.hideIndicator();
                myApp.addNotification({
                    title: 'EarthHome',
                    message: 'Network timeout.',
                    media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
                });
            }
        }
    });
};
// Post IdToken
var postRefreshToken = function (func, id, name, type) {
    var refreshData = {
        email: userData.email,
        refreshToken: userData.AuthenticationResult.RefreshToken
    };

    $$.ajax({
        url: produrl + 'user/refreshToken',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        processData: false,
        data: JSON.stringify(refreshData),
        success: function (data, status, xhr) {
            data = JSON.parse(data);
            userData.AuthenticationResult.IdToken = data.AuthenticationResult.IdToken;
            userData.AuthenticationResult.AccessToken = data.AuthenticationResult.AccessToken;
            jwtToken = userData.AuthenticationResult.IdToken;
            if (func == "putDevice()") {
                eval(func)(id, name, type);
            }
            else if (func == "putHub()" || func == "putRoom()") {
                eval(func)(id, name);
            }
            else {
                eval(func);
            }
        },
        error: function (xhr, status) {
            myApp.hidePreloader();
            myApp.pullToRefreshDone();
            myApp.hideIndicator();
            myApp.addNotification({
                title: 'EarthHome',
                message: 'Network timeout.',
                media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
            });
        }
    });
};
// Put Profile
var putProfile = function () {
    var clck_invld = 0;
    $$('.item-inner').removeClass('error-state');
    if ($$('#profile-first-name').val().trim().length < 2) {
        $$('#profile-first-name').parents('.item-inner').addClass('error-state');
        clck_invld = 1;
        $$('#profile-first-name').focus();
    }

    if (clck_invld == 1) {
        return false;
    }

    var formData = myApp.formToData('.profile-form');
    //email = formData.fullName;
    myApp.showIndicator();

    $$.ajax({
        url: produrl + 'user',
        method: 'PUT',
        headers: {
            'Authorization': jwtToken,
            'Content-Type': 'application/json'
        },
        processData: false,
        data: JSON.stringify({ fullName: formData.fullName }),
        success: function (data, status, xhr) {
            data = JSON.parse(data);
            userData.fullName = data[0].fullName;
            $$('.insert-name').text(userData.fullName);
            localStorage.setItem('loginData', JSON.stringify(userData));
            myApp.hideIndicator();
            settingView.router.back();
            myApp.addNotification({
                title: 'EarthHome',
                message: 'Profile Updated Successfully.',
                media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
            });

        },
        error: function (xhr, status) {
            if (status == 401) {
                if (localStorage.getItem("loginData") != null) {
                    postRefreshToken("putProfile()");
                }
                else {
                    myApp.hideIndicator();
                    localStorage.removeItem('loginData');
                    myApp.popup('.popup-login');
                }
            }
            else {
                myApp.hideIndicator();
                myApp.addNotification({
                    title: 'EarthHome',
                    message: 'Network timeout.',
                    media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
                });
            }
        }
    });
};

/* Views */
var loginView = null;
var dashboardView = myApp.addView('#dashboard', {
    //dynamicNavbar: true,
    domCache: true,
    url: 'dashboard'
});
var settingView = myApp.addView('#setting', {
    //dynamicNavbar: true,
    domCache: true,
    url: 'setting'
});
var ruleView = myApp.addView('#rule', {
    //dynamicNavbar: true,
    domCache: true,
    url: 'rule'
});
$$('.popup-login').on('opened', function () {
    if (loginView == null) {
        loginView = myApp.addView('#login', {
            //dynamicNavbar: true,
            domCache: true,
            url: 'login'
        });
    }
});

/*Handlers*/
//Back Key
function onBackKeyDown() {
    var x = myApp.getCurrentView();
    if (x.history.length > 1) {
        x.router.back();
    }
    else if (x.url != 'index') {
        myApp.showTab('#index');
    }
    else {
        navigator.app.clearHistory();
        navigator.app.exitApp();
    }

};
document.addEventListener('backbutton', onBackKeyDown, false);
//Resume
function onResume() {
    // TODO: This application has been reactivated. Restore application state here.
};
document.addEventListener('resume', onResume.bind(this), false);

/* Login */
// Validations
$('.input-username').blur(function () {
    $$(this).parents('.item-inner').removeClass('error-state');
    var mail_filter = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,4})+$/;
    if ($$(this).val().length < 10) {
        //}
        //if (!mail_filter.test($(this).val())) {
        $$(this).parents('.item-inner').addClass('error-state');
        $(this).parents('.item-inner').find('.item-input-error-msg').slideDown(400);
    }
    else {
        $(this).parents('.item-inner').find('.item-input-error-msg').slideUp(400);
    }
});
$('.input-email').blur(function () {
    $$(this).parents('.item-inner').removeClass('error-state');
    var mail_filter = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,4})+$/;
    if (!mail_filter.test($(this).val())) {
        $$(this).parents('.item-inner').addClass('error-state');
        $(this).parents('.item-inner').find('.item-input-error-msg').slideDown(400);
    }
    else {
        $(this).parents('.item-inner').find('.item-input-error-msg').slideUp(400);
    }
});
$('.input-text').blur(function () {
    $$(this).parents('.item-inner').removeClass('error-state');
    if ($$(this).val().trim().length < 2) {
        $$(this).parents('.item-inner').addClass('error-state');
        $(this).parents('.item-inner').find('.item-input-error-msg').slideDown(400);
    }
    else {
        $(this).parents('.item-inner').find('.item-input-error-msg').slideUp(400);
    }
});
$('.input-password').blur(function () {
    $$(this).parents('.item-inner').removeClass('error-state');
    if ($$(this).val().trim().length < 6) {
        $$(this).parents('.item-inner').addClass('error-state');
        $(this).parents('.item-inner').find('.item-input-error-msg').slideDown(400);
    }
    else {
        $(this).parents('.item-inner').find('.item-input-error-msg').slideUp(400);
    }
});
$('.input-cnfmpassword').blur(function () {
    $$(this).parents('.item-inner').removeClass('error-state');
    if ($$(this).val().trim().length < 6) {
        $$(this).parents('.item-inner').addClass('error-state');
        $(this).parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        $(this).parents('.item-inner').find('.item-input-error-msg2').slideUp(400);
    }
    else if ($$(this).val() != $$(this).parents('form').find('.input-password').val()) {
        $(this).parents('.item-inner').find('.item-input-error-msg').slideUp(400);
        $(this).parents('.item-inner').find('.item-input-error-msg2').slideDown(400);
    }
    else {
        $(this).parents('.item-inner').find('.item-input-error-msg').slideUp(400);
        $(this).parents('.item-inner').find('.item-input-error-msg2').slideUp(400);
    }
});
$('.input-mobile').blur(function () {
    $$(this).parents('.item-inner').removeClass('error-state');
    $(this).parents('.item-inner').find('.item-input-error-msg').slideUp(400);
    var mob_filter = /^[0-9]*$/;
    if (!mob_filter.test($$(this).val())) {
        $$(this).parents('.item-inner').addClass('error-state');
        $(this).parents('.item-inner').find('.item-input-error-msg').slideDown(400);
    }
    if ($$(this).val().trim().length < 10) {
        $$(this).parents('.item-inner').addClass('error-state');
        $(this).parents('.item-inner').find('.item-input-error-msg').slideDown(400);
    }
});
$("body").on('change', '.input-select', function () {
    $$(this).parents('.item-inner').removeClass('error-state');
    $(this).parents('.item-inner').find('.item-input-error-msg').slideUp(400);
    if ($(this).val() == null || $("select#insertHome").val() == 'undefined') {
        $$(this).parents('.item-inner').addClass('error-state');
        $(this).parents('.item-inner').find('.item-input-error-msg').slideDown(400);
    }
});

// Page Events
$$(document).on('page:back', '.page[data-page="register"]', function (e) {
    $$('.item-inner').removeClass('error-state');
    $('.item-inner').find('.item-input-error-msg').slideUp(400);
    $$('.register-form .error-msg').text('');
    $$('.register-container').show();
    $$('.register-container').show();
    $$('.verify-container').hide();
});
$$(document).on('page:back', '.page[data-page="forgot"]', function (e) {
    $$('.item-inner').removeClass('error-state');
    $('.item-inner').find('.item-input-error-msg').slideUp(400);

});
// Submit
var formData;
var email;
$$('.login-submit button').click(function () {
    var clck_invld = 0;
    var mail_filter = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,4})+$/;
    $$('.item-inner').removeClass('error-state');
    if ($$('#login-pass').val().trim().length < 6) {
        $$('#login-pass').parents('.item-inner').addClass('error-state');
        $('#login-pass').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $('#login-pass').focus();
    }
    //if ($('#login-email').val().length < 10) {
    if (!mail_filter.test($('#login-email').val())) {
        $$('#login-email').parents('.item-inner').addClass('error-state');
        $('#login-email').parents('.item-inner').find('.item-input-error-msg').slideDown(400);

        clck_invld = 1;
        $('#login-email').focus();
    }

    if (clck_invld == 1) {
        return false;
    }

    var formData = myApp.formToData('.login-form');
    email = formData.email;
    myApp.showIndicator();

    $$.post(produrl + 'user/login', formData,
        function (data, status, xhr) {
            //alert(data);
            data = JSON.parse(data);
            if (data.hasOwnProperty('code')) {
                myApp.hideIndicator();
                if (data.code == 'PasswordResetRequiredException') {
                    $$('.register-container').hide();
                    $$('.verify-container').show();
                    loginView.router.load({ pageName: 'register' });
                }
                else if (data.code == 'UserNotConfirmedException') {
                    $$('.register-container').hide();
                    $$('.verify-container').show();
                    loginView.router.load({ pageName: 'register' });
                }
                else {
                    $$('.login-form .error-msg').text(data.message);
                }
            }
            else {
                $$('.login-form .error-msg').text('');
                formData = {
                    email: '',
                    password: ''
                };
                myApp.formFromData('.login-form', formData);
                myApp.closeModal();
                userData = data;
                localStorage.setItem('loginData', JSON.stringify(userData));
                myApp.formFromData('.profile-form', {
                    email: userData.email,
                    mobileNumber: userData.mobileNumber,
                    fullName: userData.fullName
                });

                $$('.insert-name').text(userData.fullName);

                jwtToken = userData.AuthenticationResult.IdToken;
                getShadow();
                getHub();
                myApp.hideIndicator();
                myApp.showPreloader('Configuring your home...');
            }
        },
        function (xhr, status) {
            //alert(status);
            $$('.login-form .error-msg').text('Network error!');
            myApp.hideIndicator();
        });
});
$$('.register-submit button').click(function () {
    var clck_invld = 0;
    var mail_filter = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,4})+$/;
    var mob_filter = /^[0-9]*$/;
    $$('.item-inner').removeClass('error-state');
    if ($$('#register-homekey').val().trim().length < 2) {
        $$('#register-homekey').parents('.item-inner').addClass('error-state');
        clck_invld = 1;
        $('#register-homekey').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        $$('#register-homekey').focus();
    }
    if (!($$('#register-confirmpass').val().trim() == $('#register-pass').val().trim())) {
        $$('#register-confirmpass').parents('.item-inner').addClass('error-state');
        $('#register-confirmpass').parents('.item-inner').find('.item-input-error-msg2').slideDown(400);

        clck_invld = 1;
        $$('#register-confirmpass').focus();
    }
    if ($$('#register-confirmpass').val().trim().length < 6) {
        $$('#register-confirmpass').parents('.item-inner').addClass('error-state');
        $('#register-confirmpass').parents('.item-inner').find('.item-input-error-msg').slideDown(400);

        clck_invld = 1;
        $$('#register-confirmpass').focus();
    }
    if ($$('#register-pass').val().trim().length < 6) {
        $$('#register-pass').parents('.item-inner').addClass('error-state');
        $('#register-pass').parents('.item-inner').find('.item-input-error-msg').slideDown(400);

        clck_invld = 1;
        $$('#register-pass').focus();
    }
    if (!mob_filter.test($$('#register-mobile').val())) {
        $$('#register-mobile').parents('.item-inner').addClass('error-state');
        $('#login-pass').parents('.item-inner').find('.item-input-error-msg').slideDown(400);

        clck_invld = 1;
        $$('#register-mobile').focus();
    }
    if ($$('#register-mobile').val().trim().length < 10) {
        $$('#register-mobile').parents('.item-inner').addClass('error-state');
        $('#register-mobile').parents('.item-inner').find('.item-input-error-msg').slideDown(400);

        clck_invld = 1;
        $$('#register-mobile').focus();
    }
    if (!mail_filter.test($$('#register-email').val())) {
        $$('#register-email').parents('.item-inner').addClass('error-state');
        $('#register-email').parents('.item-inner').find('.item-input-error-msg').slideDown(400);

        clck_invld = 1;
        $$('#register-email').focus();
    }
    if ($$('#register-firstname').val().trim().length < 2) {
        $$('#register-firstname').parents('.item-inner').addClass('error-state');
        $('#register-firstname').parents('.item-inner').find('.item-input-error-msg').slideDown(400);

        clck_invld = 1;
        $$('#register-firstname').focus();
    }

    if (clck_invld == 1) {
        return false;
    }

    formData = myApp.formToData('.register-form');
    email = formData.email;
    myApp.showIndicator();

    $$.post(produrl + 'user/signup', formData,
        function (data, status, xhr) {
            data = JSON.parse(data);
            myApp.hideIndicator();
            if (data.hasOwnProperty('code')) {
                $$('.register-form .error-msg').text(data.message);
            }
            else {
                $$('.register-form .error-msg').text('');
                $$('.register-container').hide();
                $$('.verify-container').show();
            }
        },
        function (xhr, status) {
            //alert(status);
            $$('.register-form .error-msg').text('network error');
            myApp.hideIndicator();
        });
});
$$('.forgot-submit button').click(function () {
    var clck_invld = 0;
    var mail_filter = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,4})+$/;

    $$('.item-inner').removeClass('error-state');
    if (!mail_filter.test($('#forgot-email').val())) {
        $$('#forgot-email').parents('.item-inner').addClass('error-state');
        $('#forgot-email').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $('#forgot-email').focus();
    }

    if (clck_invld == 1) {
        return false;
    }

    formData = myApp.formToData('.forgot-form');
    email = formData.email;
    myApp.showIndicator();
    $$.post(produrl + 'user/forgotPassword', formData,
      function (data, status, xhr) {
          data = JSON.parse(data);
          myApp.hideIndicator();
          if (data.hasOwnProperty('code')) {
              $$('.forgot-form .error-msg').text(data.message);
          }
          else {
              $$('.forgot-form .error-msg').text('');
              //loginView.router.back();
              $$('.forgot-container').hide();
              $$('.forgot-verify-container').show();
          }
      },
      function (xhr, status) {
          console.log(status);
          $$('.forgot-form .error-msg').text('Network error!');
          myApp.hideIndicator();
      });
});
$$('.forgot-verify-submit button').click(function () {

    var clck_invld = 0;
    var mob_filter = /^[0-6]*$/;
    $$('.item-inner').removeClass('error-state');

    if ($$('#forgot-verify-number').val().trim().length < 6) {
        $$('#forgot-verify-number').parents('.item-inner').addClass('error-state');
        $('#forgot-verify-number').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#forgot-verify-number').focus();
    }
    if (!($$('#forgot-verify-cnfmpassword').val().trim() == $('#forgot-verify-password').val().trim())) {
        $$('#forgot-verify-cnfmpassword').parents('.item-inner').addClass('error-state');
        $('#forgot-verify-cnfmpassword').parents('.item-inner').find('.item-input-error-msg2').slideDown(400);

        clck_invld = 1;
        $$('#forgot-verify-cnfmpassword').focus();
    }
    if ($$('#forgot-verify-cnfmpassword').val().trim().length < 6) {
        $$('#forgot-verify-cnfmpassword').parents('.item-inner').addClass('error-state');
        $('#forgot-verify-cnfmpassword').parents('.item-inner').find('.item-input-error-msg').slideDown(400);

        clck_invld = 1;
        $$('#forgot-verify-cnfmpassword').focus();
    }
    if ($$('#forgot-verify-password').val().trim().length < 6) {
        $$('#forgot-verify-password').parents('.item-inner').addClass('error-state');
        $('#forgot-verify-password').parents('.item-inner').find('.item-input-error-msg').slideDown(400);

        clck_invld = 1;
        $$('#forgot-verify-password').focus();
    }
    if (clck_invld == 1) {
        return false;
    }

    myApp.showIndicator();
    var formData = myApp.formToData('.forgot-verify-form');
    //if (formData.code == 123456) {

    var data = {
        "email": email,
        "confirmationCode": formData.confirmationCode,
        "password": formData.password
    };
    $$.post(produrl + 'user/confirmForgotPassword', data,
        function (data, status, xhr) {
            data = JSON.parse(data);
            myApp.hideIndicator();
            if (data.hasOwnProperty('code')) {
                $$('.forgot-verify-form .error-msg').text(data.message);
            }
            else {
                $$('.verify-form .error-msg').text('');
                loginView.router.back();
                $$('.forgot-container').show();
                $$('.forgot-verify-container').hide();
                //myApp.closeModal();
                myApp.addNotification({
                    title: 'EarthHome',
                    message: 'Password Reset Successful!',
                    media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
                });
            }
        },
        function (xhr, status) {
            myApp.hideIndicator();
            //console.log(status + ' network error');
            $$('.forgot-verify-form .error-msg').text('Network error!');
        });
});
$$('.verify-submit button').click(function () {

    var clck_invld = 0;
    var mob_filter = /^[0-6]*$/;
    $$('.item-inner').removeClass('error-state');

    if ($$('#verify-number').val().trim().length < 6) {
        $$('#verify-number').parents('.item-inner').addClass('error-state');
        $('#verify-number').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#verify-number').focus();
    }

    if (clck_invld == 1) {
        return false;
    }

    var formData = myApp.formToData('.verify-form');
    //if (formData.code == 123456) {
    myApp.showIndicator();
    var data = {
        "email": email,
        "confirmationCode": formData.code
    };
    $$.post(produrl + 'user/confirmSignUp', data,
        function (data, status, xhr) {
            data = JSON.parse(data);
            myApp.hideIndicator();

            if (data.hasOwnProperty('code')) {
                $$('.verify-form .error-msg').text(data.message);
            }
            else {
                $$('.verify-form .error-msg').text('');
                loginView.router.back();
                $$('.register-container').show();
                $$('.verify-container').hide();
                //myApp.closeModal();
                myApp.addNotification({
                    title: 'EarthHome',
                    message: 'Registration Successful! Please Login to continue.',
                    media: '<img width="44" height="44" style="border-radius:100%" src="images/logo.jpg">',
                });
            }
        },
        function (xhr, status) {
            //alert(status + ' network error');
            $$('.verify-form .error-msg').text('Network error!');
            myApp.hideIndicator();

        });
});
$$('.menu-logout').click(function () {
    localStorage.removeItem('loginData');
    myApp.popup('.popup-login');
});
$$('.verify-submit div').click(function () {
    myApp.showIndicator();
    var data = {
        "email": email
    };
    $$.post(produrl + 'user/resendConfirmationCode', data,
       function (data, status, xhr) {
           data = JSON.parse(data);
           myApp.hideIndicator();
           //if (data.hasOwnProperty('code')) {
           $$('.verify-form .error-msg').text(data.message);
           //}
           //else {
           //$$('.verify-form .error-msg').text('Code sent.');
           //}
       },
       function (xhr, status) {
           myApp.hideIndicator();
           $$('.verify-form .error-msg').text('Network error!');
       });
});

/* Profile Submit */
$$('.profile-submit button').click(function () {
    putProfile();
});

/* Pull to Refresh */
var ptrContent = $$('.pull-to-refresh-content');
ptrContent.on('ptr:refresh', function (e) {
    getHub();
    if (!connected) {
        connectMQTT();
    }
});


/* Edit Home / Hub / Device */
// Init
$$('body').on('click', '.edit-home', function (e) {
    $$('#insertHome').html('');
    $$('#home-edit-name').val('');
    homeList = Template7.templates.homeList(home);
    $$('#insertHome').html(homeList);
    dashboardView.router.load({ 'pageName': 'edit-home-page' });
});
$$('body').on('click', '.edit-room', function (e) {
    $$('#insertHomeRoom').html('');
    document.getElementById('insertRoom').innerHTML = '';
    $$('#room-edit-name').val('');
    homeList = Template7.templates.homeList(home);
    $$('#insertHomeRoom').html(homeList);
    dashboardView.router.load({ 'pageName': 'edit-room-page' });
});
$$('body').on('click', '.edit-device', function (e) {
    $$('#insertHomeDevice').html('');
    document.getElementById('insertRoomDevice').innerHTML = '';
    document.getElementById('insertDevice').innerHTML = '';
    $$('#device-edit-name').val('');
    homeList = Template7.templates.homeList(home);
    $$('#insertHomeDevice').html(homeList);
    dashboardView.router.load({ 'pageName': 'edit-device-page' });
});
// Chanhge
$$('body').on('change', 'select[id^=insertHome]', function (e) {
    if ($$(this).parents('#edit-home-page').length > 0) {
        $('#home-edit-name').val($(this).children('option:selected').text());
        $$('#home-edit-name').focus();
    }
    else if ($$(this).parents('#edit-room-page').length > 0) {
        roomList = Template7.templates.roomList(home);
        document.getElementById('insertRoom').innerHTML = roomList;
        $$('#insertRoom').focus();
    }
    else if ($$(this).parents('#edit-device-page').length > 0) {
        roomList = Template7.templates.roomList(home);
        document.getElementById('insertRoomDevice').innerHTML = roomList;
        $$('#insertRoomDevice').focus();
    }

});
$$('body').on('change', 'select[id^=insertRoom]', function (e) {
    if ($$(this).parents('#edit-room-page').length > 0) {
        $('#room-edit-name').val($(this).children('option:selected').text());
        $$('#room-edit-name').focus();
    }
    else if ($$(this).parents('#edit-device-page').length > 0) {
        var id = parseInt($(this).children('option:selected').val(), 10);
        for (var i = 0; i < home.hub.rooms.length; i++) {
            if (id == home.hub.rooms[i].id) {
                deviceList = Template7.templates.deviceList(home.hub.rooms[i]);
                document.getElementById('insertDevice').innerHTML = deviceList;
                $$('#insertDevice').focus();
                break;
            }
        }
    }

});
$$('body').on('change', 'select[id^=insertDevice]', function (e) {
    $('#device-edit-name').val($(this).children('option:selected').text());
    $$('#device-edit-name').focus();
});
// Submit
$$('.home-submit button').click(function () {
    clck_invld = 0;
    if ($$('#home-edit-name').val().trim().length < 2) {
        $$('#home-edit-name').parents('.item-inner').addClass('error-state');
        $('#home-edit-name').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#home-edit-name').focus();
    }
    if ($("select#insertHome").val() == null || $("select#insertHome").val() == 'undefined') {
        $$('#insertHome').parents('.item-inner').addClass('error-state');
        $('#insertHome').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#insertHome').focus();
    }

    if (clck_invld == 1) {
        return false;
    }
    putHub(parseInt($('#insertHome option:selected').val(), 10), $$('#home-edit-name').val());
});
$$('.room-submit button').click(function () {
    clck_invld = 0;
    if ($$('#room-edit-name').val().trim().length < 2) {
        $$('#room-edit-name').parents('.item-inner').addClass('error-state');
        $('#room-edit-name').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#room-edit-name').focus();
    }
    if ($("select#insertRoom").val() == null || $("select#insertRoom").val() == 'undefined') {
        $$('#insertRoom').parents('.item-inner').addClass('error-state');
        $('#insertRoom').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#insertRoom').focus();
    }
    if ($("select#insertHomeRoom").val() == null || $("select#insertHomeRoom").val() == 'undefined') {
        $$('#insertHomeRoom').parents('.item-inner').addClass('error-state');
        $('#insertHomeRoom').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#insertHomeRoom').focus();
    }

    if (clck_invld == 1) {
        return false;
    }
    putRoom(parseInt($('#insertRoom option:selected').val(), 10), $$('#room-edit-name').val());
});
$$('.device-submit button').click(function () {
    var clck_invld = 0;
    if ($("select#device-edit-type").val() == null || $("select#device-edit-type").val() == 'undefined') {
        $$('#device-edit-type').parents('.item-inner').addClass('error-state');
        $('#device-edit-type').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#device-edit-type').focus();
    }
    if ($$('#device-edit-name').val().trim().length < 2) {
        $$('#device-edit-name').parents('.item-inner').addClass('error-state');
        $('#device-edit-name').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#device-edit-name').focus();
    }
    if ($("select#insertDevice").val() == null || $("select#insertDevice").val() == 'undefined') {
        $$('#insertDevice').parents('.item-inner').addClass('error-state');
        $('#insertDevice').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#insertDevice').focus();
    }
    if ($("select#insertRoomDevice").val() == null || $("select#insertRoomDevice").val() == 'undefined') {
        $$('#insertRoomDevice').parents('.item-inner').addClass('error-state');
        $('#insertRoomDevice').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#insertRoomDevice').focus();
    }
    if ($("select#insertHomeDevice").val() == null || $("select#insertHomeDevice").val() == 'undefined') {
        $$('#insertHomeDevice').parents('.item-inner').addClass('error-state');
        $('#insertHomeDevice').parents('.item-inner').find('.item-input-error-msg').slideDown(400);
        clck_invld = 1;
        $$('#insertHomeDevice').focus();
    }
    if (clck_invld == 1) {
        return false;
    }
    putDevice(parseInt($('#insertDevice option:selected').val(), 10), $$('#device-edit-name').val(), $('#device-edit-type option:selected').val());
});

/* Picker Modal */
var carVendors = {
    Home: ['Whole Home', 'Whole Room1', 'Whole Room2', 'Whole Room3', 'Whole Room4'],
    Room1: ['Fan', 'TubeLight', 'Bulb'],
    Room2: ['Fan', 'TubeLight', 'Bulb']
};
var pickerDependent = myApp.picker({
    input: '#picker-dependent',
    rotateEffect: true,
    formatValue: function (picker, values) {
        return values[0] + ' ' + values[1];
    },
    cols: [
        {
            textAlign: 'left',
            values: ['Home', 'Room1', 'Room2'],
            onChange: function (picker, Home) {
                if (picker.cols[1].replaceValues) {
                    picker.cols[1].replaceValues(carVendors[Home]);
                }
            }
        },
        {
            values: carVendors.Home,
            width: 160,
        },
    ]
});
var pickerDevice = myApp.picker({
    input: '#picker-status',
    cols: [
        {
            textAlign: 'center',
            values: ['On', 'Off']
        }
    ]
});
var pickerDescribe = myApp.picker({
    input: '#picker-time',
    rotateEffect: true,
    formatValue: function (picker, values) {
        return values[0] + ':' + values[1];
    },
    cols: [
        {
            textAlign: 'left',
            values: ('00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 8 19 20 21 22 23').split(' ')
        },
        {
            values: ('00 15 30 45').split(' ')
        },
    ]
});

/* Login Condition */
if (localStorage.getItem('loginData') == null) {
    myApp.popup('.popup-login');
    //getHub();
    //createClient();
}
else {
    userData = JSON.parse(localStorage.getItem("loginData"));
    myApp.formFromData('.profile-form', {
        email: userData.email,
        mobileNumber: userData.mobileNumber,
        fullName: userData.fullName
    });
    $$('.insert-name').text(userData.fullName);
    jwtToken = userData.AuthenticationResult.IdToken;
    myApp.showPreloader('Updating your home...');
    //getShadow();
    getHub();
    if (!connected) {
        connectMQTT();
    }
    //postRefreshToken("getHub()");
    //createClient();
    //myApp.showIndicator();
}
window.setTimeout(function () {
    navigator.splashscreen.hide();
}, 1000);
