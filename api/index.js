const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/User');
const Post = require('./models/Post');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();

// Configuration
const salt = bcrypt.genSaltSync(10);
const secret = 'akdjkdjeiji393kdfjkd';
const mongoUri = 'mongodb+srv://ayushmaanmzp:Gv4P0QFWCpvcxnMv@cluster0.mjlyi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload configuration
const uploadMiddleware = multer({ dest: 'uploads/' });

// Routes
app.get('/', (req, res) => {
    res.send('Server is up and running!');
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = bcrypt.hashSync(password, salt);
        const userDoc = await User.create({ username, password: hashedPassword });
        res.json(userDoc);
    } catch (e) {
        console.error('Registration error:', e);
        res.status(400).json(e);
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const userDoc = await User.findOne({ username });
        if (!userDoc) {
            return res.status(400).json('User not found');
        }
        const passOk = bcrypt.compareSync(password, userDoc.password);
        if (passOk) {
            jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
                if (err) return res.status(500).json({ error: 'Token generation failed' });
                res.cookie('token', token, { httpOnly: true }).json({
                    id: userDoc._id,
                    username,
                });
            });
        } else {
            res.status(400).json('Wrong credentials');
        }
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json('Internal server error');
    }
});

app.get('/profile', (req, res) => {
    const { token } = req.cookies;
    jwt.verify(token, secret, {}, (err, info) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.json(info);
    });
});

app.post('/logout', (req, res) => {
    res.cookie('token', '', { httpOnly: true }).json('ok');
});

app.post('/post', uploadMiddleware.single('file'), async (req, res) => {
    const { originalname, path: filePath } = req.file;
    const ext = originalname.split('.').pop();
    const newPath = `${filePath}.${ext}`;
    fs.renameSync(filePath, newPath);

    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        const { title, summary, content } = req.body;
        try {
            const postDoc = await Post.create({
                title,
                summary,
                content,
                cover: newPath,
                author: info.id,
            });
            res.json(postDoc);
        } catch (e) {
            console.error('Post creation error:', e);
            res.status(500).json('Internal server error');
        }
    });
});

app.put('/post', uploadMiddleware.single('file'), async (req, res) => {
    let newPath = null;
    if (req.file) {
        const { originalname, path: filePath } = req.file;
        const ext = originalname.split('.').pop();
        newPath = `${filePath}.${ext}`;
        fs.renameSync(filePath, newPath);
    }

    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });

        const { id, title, summary, content } = req.body;
        try {
            const postDoc = await Post.findById(id);
            if (!postDoc) {
                return res.status(404).json('Post not found');
            }
            if (postDoc.author.toString() !== info.id) {
                return res.status(403).json('Not authorized to update this post');
            }
            await postDoc.update({
                title,
                summary,
                content,
                cover: newPath ? newPath : postDoc.cover,
            });
            res.json(postDoc);
        } catch (e) {
            console.error('Post update error:', e);
            res.status(500).json('Internal server error');
        }
    });
});

app.get('/post', async (req, res) => {
    try {
        const posts = await Post.find().populate('author', ['username']).sort({ createdAt: -1 }).limit(20);
        res.json(posts);
    } catch (e) {
        console.error('Fetching posts error:', e);
        res.status(500).json('Internal server error');
    }
});

app.get('/post/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const postDoc = await Post.findById(id).populate('author', ['username']);
        if (!postDoc) {
            return res.status(404).json('Post not found');
        }
        res.json(postDoc);
    } catch (e) {
        console.error('Fetching post error:', e);
        res.status(500).json('Internal server error');
    }
});

// Start the server
app.listen(4000, () => {
    console.log('Server is running on http://localhost:4000');
});
