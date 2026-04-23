//
// Minimal MeshAgent WebRTC Signaling + Viewer Server
// Designed for standalone .exe builds
//

var http = require('http');
var ws = require('ws');
var webrtc = require('webrtc');
var fs = require('fs');

// -------------------------------
// 1. Serve Viewer Files
// -------------------------------

var viewerFiles = {
    "/": "viewer/relay.htm",
    "/relay.htm": "viewer/relay.htm",
    "/relay.js": "viewer/relay.js",
    "/meshcentral.js": "viewer/meshcentral.js",
    "/agent-desktop.js": "viewer/agent-desktop-0.0.2.js",
    "/agent-rdp.js": "viewer/agent-rdp-0.0.1.js",
    "/agent-redir-rtc.js": "viewer/agent-redir-rtc-0.1.0.js",
    "/agent-redir-ws.js": "viewer/agent-redir-ws-0.1.1.js"
};

var server = http.createServer(function (req, res) {
    var file = viewerFiles[req.url];
    if (!file) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    try {
        var data = fs.readFileSync(__dirname + "/" + file);
        res.writeHead(200);
        res.end(data);
    } catch (e) {
        res.writeHead(500);
        res.end("Error loading file");
    }
});

server.listen(8080);
console.log("HTTP server running on port 8080");


// -------------------------------
// 2. WebRTC Signaling Server
// -------------------------------

var wss = new ws.Server({ server: server });
var rtcSession = null;

wss.on('connection', function (socket) {
    console.log("Browser connected to signaling server");

    socket.on('message', function (msg) {
        var data = JSON.parse(msg);

        // Browser → Offer
        if (data.type === "offer") {
            rtcSession = webrtc.createConnection();

            rtcSession.onicecandidate = function (cand) {
                socket.send(JSON.stringify({ type: "ice", candidate: cand }));
            };

            rtcSession.ondatachannel = function (dc) {
                console.log("WebRTC data channel established");

                dc.onmessage = function (msg) {
                    // Browser input → MeshAgent native KVM
                    agent.KVM.sendInput(msg.data);
                };
            };

            rtcSession.setRemoteDescription(data);
            rtcSession.createAnswer(function (answer) {
                rtcSession.setLocalDescription(answer);
                socket.send(JSON.stringify(answer));
            });
        }

        // Browser → ICE
        if (data.type === "ice") {
            if (rtcSession) rtcSession.addIceCandidate(data.candidate);
        }
    });
});

console.log("WebRTC signaling active");


// -------------------------------
// 3. Connect MeshAgent KVM to WebRTC
// -------------------------------

agent.KVM.onFrame = function (frame) {
    if (rtcSession && rtcSession.dataChannel) {
        rtcSession.dataChannel.send(frame);
    }
};

console.log("MeshAgent KVM → WebRTC bridge active");
