-- Flipbook App Database Schema
CREATE DATABASE IF NOT EXISTS flipbook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE flipbook;

-- Main flipbooks table
CREATE TABLE IF NOT EXISTS flipbooks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    pdf_filename VARCHAR(500),
    page_count INT DEFAULT 0,
    thumbnail VARCHAR(500),
    toc_json TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_slug (slug),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- Extracted text per page for search
CREATE TABLE IF NOT EXISTS flipbook_pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    flipbook_id INT NOT NULL,
    page_number INT NOT NULL,
    text_content TEXT,
    FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id) ON DELETE CASCADE,
    UNIQUE KEY uk_flipbook_page (flipbook_id, page_number),
    FULLTEXT INDEX ft_text (text_content)
) ENGINE=InnoDB;

-- YouTube video overlays on pages
CREATE TABLE IF NOT EXISTS flipbook_videos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    flipbook_id INT NOT NULL,
    page_number INT NOT NULL,
    youtube_url VARCHAR(500) NOT NULL,
    pos_x_percent FLOAT DEFAULT 10,
    pos_y_percent FLOAT DEFAULT 10,
    width_percent FLOAT DEFAULT 40,
    height_percent FLOAT DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id) ON DELETE CASCADE,
    INDEX idx_flipbook_page (flipbook_id, page_number)
) ENGINE=InnoDB;

-- Clickable link overlays on pages
CREATE TABLE IF NOT EXISTS flipbook_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    flipbook_id INT NOT NULL,
    page_number INT NOT NULL,
    url VARCHAR(1000) NOT NULL,
    label VARCHAR(255) DEFAULT 'Click here',
    pos_x_percent FLOAT DEFAULT 10,
    pos_y_percent FLOAT DEFAULT 10,
    width_percent FLOAT DEFAULT 20,
    height_percent FLOAT DEFAULT 6,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id) ON DELETE CASCADE,
    INDEX idx_flipbook_page (flipbook_id, page_number)
) ENGINE=InnoDB;
