const peer = new RTCPeerConnection();
let dataChannel;

// Handle file selection
document.getElementById('shareBtn').addEventListener('click', () => {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select a file first!');
        return;
    }

    const file = fileInput.files[0];

    // Create data channel
    dataChannel = peer.createDataChannel("fileTransfer");
    dataChannel.binaryType = "arraybuffer";

    // Generate offer
    peer.createOffer().then(offer => {
        return peer.setLocalDescription(offer);
    }).then(() => {
        const link = `${window.location.origin}?offer=${btoa(JSON.stringify(peer.localDescription))}`;
        document.getElementById('shareLink').value = link;
        document.getElementById('result').classList.remove('hidden');

        // Generate QR code
        const qrCodeDiv = document.getElementById('qrCode');
        qrCodeDiv.innerHTML = '';
        new QRCode(qrCodeDiv, link);
    });

    // Send file in chunks
    dataChannel.onopen = () => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = () => {
            dataChannel.send(reader.result);
        };
    };
});

// Handle receiving connection
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('offer')) {
    const offer = JSON.parse(atob(urlParams.get('offer')));
    document.getElementById('receiveSection').classList.remove('hidden');

    peer.setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
        return peer.createAnswer();
    }).then(answer => {
        return peer.setLocalDescription(answer);
    }).then(() => {
        // Show status
        document.getElementById('receiverStatus').innerText = "Connected! Receiving file...";

        peer.ondatachannel = event => {
            const receiveChannel = event.channel;
            receiveChannel.binaryType = "arraybuffer";

            receiveChannel.onmessage = (event) => {
                const receivedBlob = new Blob([event.data]);
                const downloadLink = document.getElementById('downloadLink');
                downloadLink.href = URL.createObjectURL(receivedBlob);
                downloadLink.download = "received_file";
                downloadLink.classList.remove('hidden');
                downloadLink.innerText = "Download File";
            };
        };
    });
}
