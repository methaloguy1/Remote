//
// Minimal standalone MeshAgent WebRTC server
// Works with your exact repo structure
//

var http = require('http');
var ws = require('ws');
var webrtc = require('webrtc');
var fs = require('fs');

// -------------------------------
// 1. Serve viewer files
// -------------------------------

function serveFile(path) {
    try {
        return fs.readFileSync(__dirname + "/viewer/" + path);
    } catch (e) {
        return null;
    }
}

var server = http.createServer(function (req, res) {
    var file = null;

    if (req.url === "/" || req.url === "/relay.htm") file = serveFile("relay.htm");
    else if (req.url === "/relay.js") file = serveFile("relay.js");
    else if (req.url === "/meshcentral.js") file = serveFile("meshcentral.js");
    else if (req.url === "/agent-desktop.js") file = serveFile("agent-desktop-0.0.2.js");
    else if (req.url === "/agent-rdp.js") file = serveFile("agent-rdp-0.0.1.js");
    else if (req.url === "/agent-redir-rtc.js") file = serveFile("agent-redir-rtc-0.1.0.js");
    else if (req.url === "/agent-redir-ws.js") file = serveFile("agent-redir-ws-0.1.1.js");

    if (!file) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    res.writeHead(200);
    res.end(file);
});

server.listen(8080);
console.log("HTTP server running on port 8080");


// -------------------------------
// 2. WebRTC signaling
// -------------------------------

var wss = new ws.Server({ server: server });
var rtc = null;

wss.on('connection', function (socket) {
    console.log("Browser connected");

    socket.on('message', function (msg) {
        var data = JSON.parse(msg);

        if (data.type === "offer") {
            rtc = webrtc.createConnection();

            rtc.onicecandidate = function (cand) {
                socket.send(JSON.stringify({ type: "ice", candidate: cand }));
            };

            rtc.ondatachannel = function (dc) {
                console.log("WebRTC data channel ready");

                dc.onmessage = function (msg) {
                    agent.KVM.sendInput(msg.data);
                };
            };

            rtc.setRemoteDescription(data);
            rtc.createAnswer(function (answer) {
                rtc.setLocalDescription(answer);
                socket.send(JSON.stringify(answer));
            });
        }

        if (data.type === "ice" && rtc) {
            rtc.addIceCandidate(data.candidate);
        }
    });
});

console.log("WebRTC signaling active");


// -------------------------------
// 3. Connect MeshAgent KVM → WebRTC
// -------------------------------

agent.KVM.onFrame = function (frame) {
    if (rtc && rtc.dataChannel) {
        rtc.dataChannel.send(frame);
    }
};

console.log("KVM → WebRTC bridge active");
