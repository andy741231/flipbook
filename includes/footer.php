    </main>
    <footer class="footer">
        <p>&copy; <?= date('Y') ?> <?= APP_NAME ?> &mdash; v<?= APP_VERSION ?></p>
    </footer>
    <?php if (isset($extraScripts)) echo $extraScripts; ?>
</body>
</html>
