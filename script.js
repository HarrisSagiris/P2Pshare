// Connect to WebSocket server
const ws = new WebSocket(`ws://${window.location.host}`);

const peer = new RTCPeerConnection({
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
});

let dataChannel;
let fileToSend = null;
const CHUNK_SIZE = 16384;
let roomId = null;
let peerId = null;

// Handle file selection and sharing
document.getElementById('shareBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select a file first!');
        return;
    }

    fileToSend = fileInput.files[0];
    
    // Upload file to server
    const formData = new FormData();
    formData.append('file', fileToSend);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            document.getElementById('result').classList.remove('hidden');
            const shareLink = document.getElementById('shareLink');
            shareLink.value = result.downloadLink;
            document.getElementById('progressBar').style.width = '100%';
            document.getElementById('senderStatus').innerText = 'File uploaded successfully!';
        } else {
            throw new Error('Upload failed');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        document.getElementById('uploadFallback').classList.remove('hidden');
        document.getElementById('senderStatus').innerText = 'Direct upload failed. Please try the fallback upload.';
    }
});

// Check URL for download link
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get('file');
    if (fileId) {
        document.getElementById('hostSection').classList.add('hidden');
        document.getElementById('receiveSection').classList.remove('hidden');
        
        const downloadLink = document.getElementById('downloadLink');
        downloadLink.href = `/download/${fileId}`;
        downloadLink.classList.remove('hidden');
        downloadLink.innerText = 'Download File';
        document.getElementById('receiverStatus').innerText = 'Ready to download!';
        document.getElementById('progressBar').style.width = '100%';
    }
});
