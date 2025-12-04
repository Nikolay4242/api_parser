const puppeteer = require('puppeteer');
const fs = require('fs');

async function parseProductPage(url, region) {
    console.log('Запуск парсера...');
    console.log('URL:', url);
    console.log('Регион:', region);

    // Запускаем браузер
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    try {
        const page = await browser.newPage();
        
        // Устанавливаем размер окна
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Переходим на страницу
        await page.goto(url, { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        console.log('Страница загружена');
        
        // Ждем загрузки основных элементов
        await page.waitForSelector('body');
        
        // Функция для выбора региона (упрощенная версия)
        await selectRegion(page, region);
        
        // Ждем 3 секунды (альтернатива waitForTimeout)
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Делаем скриншот всей страницы
        console.log('Делаем скриншот...');
        await page.screenshot({
            path: 'screenshot.jpg',
            fullPage: true,
            quality: 80
        });
        
        // Извлекаем данные о товаре
        console.log('Извлекаем данные о товаре...');
        const productData = await extractProductData(page);
        
        // Сохраняем данные в файл
        saveProductData(productData);
        
        console.log('Готово!');
        console.log('Скриншот сохранен: screenshot.jpg');
        console.log('Данные сохранены: product.txt');
        
        // Выводим данные
        console.log('\nИзвлеченные данные:');
        console.log('Цены:', productData.prices);
        console.log('Рейтинг:', productData.rating);
        console.log('Отзывов:', productData.reviewsCount);
        
        return productData;
        
    } catch (error) {
        console.error('Ошибка:', error.message);
        throw error;
    } finally {
        await browser.close();
    }
}

async function selectRegion(page, region) {
    console.log('Пытаемся выбрать регион:', region);
    
    try {
        // Сначала проверяем, есть ли уже выбранный регион
        const pageContent = await page.content();
        
        // Если регион уже выбран, пропускаем
        if (pageContent.includes(region.split(' ')[0])) {
            console.log('Регион уже выбран, пропускаем');
            return;
        }
        
        // Пробуем найти иконку/кнопку региона
        const regionSelectors = [
            'svg', // часто иконка локации
            'path[d*="M12"]', // путь в SVG иконке локации
            '[class*="location"]',
            '[class*="region"]',
            '[class*="city"]',
            'button',
            'a'
        ];
        
        let clicked = false;
        
        for (const selector of regionSelectors) {
            try {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    const text = await page.evaluate(el => el.textContent || '', element);
                    const innerHTML = await page.evaluate(el => el.innerHTML || '', element);
                    
                    // Ищем элементы, связанные с локацией/регионом
                    if (text.includes('СПб') || text.includes('Питер') || 
                        text.includes('Москва') || text.includes('город') ||
                        innerHTML.includes('location') || innerHTML.includes('map-pin')) {
                        
                        console.log('Нашли элемент региона:', selector);
                        await element.click();
                        clicked = true;
                        
                        // Ждем появления модального окна
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        // Ищем поле ввода
                        const inputs = await page.$$('input');
                        for (const input of inputs) {
                            const placeholder = await page.evaluate(el => el.placeholder || '', input);
                            if (placeholder.includes('город') || placeholder.includes('адрес')) {
                                // Вводим регион
                                await input.click();
                                await page.keyboard.down('Control');
                                await page.keyboard.press('A');
                                await page.keyboard.up('Control');
                                await page.keyboard.press('Backspace');
                                await input.type(region, { delay: 100 });
                                
                                // Ждем появления подсказок
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                
                                // Нажимаем Enter
                                await page.keyboard.press('Enter');
                                await new Promise(resolve => setTimeout(resolve, 3000));
                                console.log('Регион выбран');
                                return;
                            }
                        }
                    }
                }
                if (clicked) break;
            } catch (e) {
                // Продолжаем поиск
            }
        }
        
        if (!clicked) {
            console.log('Не удалось найти элемент выбора региона');
            console.log('Продолжаем без смены региона...');
        }
        
    } catch (error) {
        console.log('Ошибка при выборе региона:', error.message);
        console.log('Продолжаем без смены региона...');
    }
}

async function extractProductData(page) {
    const data = {
        prices: [],
        rating: null,
        reviewsCount: null,
        timestamp: new Date().toISOString()
    };
    
    try {
        // Получаем HTML страницы
        const html = await page.content();
        
        // 1. Ищем цены с помощью регулярных выражений
        const priceRegexes = [
            /"price"\s*:\s*["']?(\d+)["']?/g,
            /"currentPrice"\s*:\s*["']?(\d+)["']?/g,
            /data-price=["'](\d+)["']/g,
            /(\d{2,})\s*₽/g,
            /₽\D*(\d+)/g
        ];
        
        for (const regex of priceRegexes) {
            let match;
            while ((match = regex.exec(html)) !== null) {
                const price = match[1];
                if (price && !data.prices.includes(price)) {
                    data.prices.push(price);
                }
            }
        }
        
        // Если не нашли цены, ищем через селекторы
        if (data.prices.length === 0) {
            const priceElements = await page.$$('*');
            for (const element of priceElements.slice(0, 50)) { // Проверяем первые 50 элементов
                try {
                    const text = await page.evaluate(el => el.textContent, element);
                    if (text && text.includes('₽')) {
                        const priceMatch = text.match(/(\d+)\s*₽/);
                        if (priceMatch) {
                            const price = priceMatch[1];
                            if (!data.prices.includes(price)) {
                                data.prices.push(price);
                            }
                        }
                    }
                } catch (e) {
                    // Пропускаем ошибки
                }
            }
        }
        
        // 2. Ищем рейтинг
        const ratingRegex = /"rating"\s*:\s*["']?(\d+\.?\d*)["']?/;
        const ratingMatch = html.match(ratingRegex);
        if (ratingMatch) {
            data.rating = ratingMatch[1];
        } else {
            // Ищем в тексте
            const ratingElements = await page.$$('*');
            for (const element of ratingElements.slice(0, 50)) {
                try {
                    const text = await page.evaluate(el => el.textContent, element);
                    if (text && (text.includes('★') || text.includes('рейтинг'))) {
                        const ratingMatch = text.match(/(\d+\.?\d*)/);
                        if (ratingMatch && !ratingMatch[1].includes('202')) { // Исключаем годы
                            data.rating = ratingMatch[1];
                            break;
                        }
                    }
                } catch (e) {
                    // Пропускаем ошибки
                }
            }
        }
        
        // 3. Ищем количество отзывов
        const reviewsRegex = /(\d+)\s*отзыв/i;
        const reviewsMatch = html.match(reviewsRegex);
        if (reviewsMatch) {
            data.reviewsCount = reviewsMatch[1];
        } else {
            // Ищем в тексте
            const allText = await page.evaluate(() => document.body.textContent);
            const reviewsMatch2 = allText.match(/(\d+)\s*отзыв/i);
            if (reviewsMatch2) {
                data.reviewsCount = reviewsMatch2[1];
            }
        }
        
    } catch (error) {
        console.log('Ошибка при извлечении данных:', error.message);
    }
    
    // Если не нашли данные, добавляем заглушки
    if (data.prices.length === 0) {
        data.prices.push('Не удалось извлечь');
    }
    
    return data;
}

function saveProductData(data) {
    let content = '='.repeat(50) + '\n';
    content += 'ДАННЫЕ ТОВАРА С VPROK.RU\n';
    content += '='.repeat(50) + '\n\n';
    
    content += `Дата и время: ${new Date(data.timestamp).toLocaleString('ru-RU')}\n\n`;
    
    content += 'ЦЕНЫ:\n';
    data.prices.forEach((price, index) => {
        content += `  ${index + 1}. ${price} ₽\n`;
    });
    
    content += '\nРЕЙТИНГ:\n';
    content += `  ${data.rating || 'Не найден'}\n`;
    
    content += '\nКОЛИЧЕСТВО ОТЗЫВОВ:\n';
    content += `  ${data.reviewsCount || 'Не найдено'}\n`;
    
    content += '\n' + '='.repeat(50);
    
    fs.writeFileSync('product.txt', content, 'utf8');
}

// Основная функция
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Использование: node puppeteer.js <URL_товара> "<регион>"');
        console.log('Пример: node puppeteer.js "https://www.vprok.ru/product/..." "Санкт-Петербург и область"');
        console.log('\nДоступные регионы:');
        console.log('- Москва и область');
        console.log('- Санкт-Петербург и область');
        console.log('- Екатеринбург и область');
        console.log('- Казань и область');
        console.log('- Новосибирск и область');
        return;
    }
    
    const productUrl = args[0];
    const region = args[1];
    
    console.log('='.repeat(50));
    console.log('ПАРСЕР VPROK.RU');
    console.log('='.repeat(50));
    
    try {
        await parseProductPage(productUrl, region);
    } catch (error) {
        console.error('Фатальная ошибка:', error.message);
        console.log('\nСоветы по устранению ошибок:');
        console.log('1. Проверьте подключение к интернету');
        console.log('2. Убедитесь, что URL корректен');
        console.log('3. Попробуйте использовать VPN');
        console.log('4. Запустите скрипт с параметром headless: false для отладки');
    }
}

// Запускаем скрипт
if (require.main === module) {
    main();
}