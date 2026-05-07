<?php require_once __DIR__ . '/../config.php'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= isset($pageTitle) ? $pageTitle . ' - ' : '' ?><?= APP_NAME ?></title>
    <base href="<?= BASE_PATH ?>/">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400&family=League+Gothic&family=Source+Sans+3:ital,wght@0,200..900;1,200..900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="assets/css/app.css">
    <?php if (isset($extraHead)) echo $extraHead; ?>
</head>
<body>
    <nav class="navbar">
        <div class="navbar-inner">
            <a href="index.php" class="navbar-brand">
                <i class="fas fa-book-open"></i>
                <span><?= APP_NAME ?></span>
            </a>
            <div class="navbar-actions">
                <a href="upload.php" class="btn btn-primary btn-sm">
                    <i class="fas fa-plus"></i> New Flipbook
                </a>
            </div>
        </div>
    </nav>
    <main class="main-content">
