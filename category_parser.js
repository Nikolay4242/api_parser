const puppeteer = require('puppeteer');
const fs = require('fs');

class VprokCategoryParser {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init() {
        console.log('🚀 Инициализация парсера...');
        
        this.browser = await puppeteer.launch({
            headless: false, // ВИДИМЫЙ БРАУЗЕР для отладки
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled'
            ],
            defaultViewport: null
        });
        
        this.page = await this.browser.newPage();
        
        // Маскируемся под обычный браузер
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Скрываем WebDriver
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false
            });
        });
        
        // Включаем все ресурсы
        await this.page.setRequestInterception(false);
    }

    async parseCategory(categoryUrl) {
        console.log(`\n📁 Парсим категорию: ${categoryUrl}`);
        
        try {
            // Переходим на страницу
            console.log('🌐 Загружаем страницу...');
            await this.page.goto(categoryUrl, {
                waitUntil: 'networkidle0',
                timeout: 60000
            });
            
            console.log('✅ Страница загружена');
            
            // Ждем немного
            await this.delay(5000);
            
            // Прокручиваем страницу для загрузки всех товаров
            console.log('🔄 Прокручиваем страницу...');
            await this.scrollPage();
            
            // Получаем HTML для анализа
            const html = await this.page.content();
            
            // Сохраняем HTML для отладки
            fs.writeFileSync('debug_page.html', html);
            console.log('📄 HTML сохранен: debug_page.html');
            
            // Ищем товары разными методами
            let products = [];
            
            // Метод 1: Через evalute
            products = await this.extractProductsWithEval();
            
            // Если не нашли, пробуем метод 2
            if (products.length === 0) {
                console.log('🔄 Метод 1 не сработал, пробуем метод 2...');
                products = await this.extractProductsWithSelectors();
            }
            
            // Если все еще не нашли, пробуем метод 3
            if (products.length === 0) {
                console.log('🔄 Метод 2 не сработал, пробуем метод 3...');
                products = this.extractProductsFromHTML(html);
            }
            
            // Получаем информацию о категории
            const categoryInfo = await this.getCategoryInfo();
            
            // Сохраняем результаты
            this.saveResults(categoryInfo, products, categoryUrl);
            
            return {
                category: categoryInfo,
                products: products,
                count: products.length
            };
            
        } catch (error) {
            console.error('❌ Ошибка при парсинге:', error);
            return {
                category: { name: 'Ошибка', url: categoryUrl },
                products: [],
                count: 0
            };
        }
    }

    async scrollPage() {
        await this.page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 500;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    
                    // Если прокрутили всю страницу или прошло 10 секунд
                    if (totalHeight >= scrollHeight || totalHeight > 5000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 300);
            });
        });
        
        await this.delay(3000);
    }

    async extractProductsWithEval() {
        console.log('🔍 Извлекаем товары через evaluate...');
        
        return await this.page.evaluate(() => {
            const products = [];
            
            // Ищем все ссылки на товары
            const productLinks = document.querySelectorAll('a[href*="/product/"]');
            
            productLinks.forEach(link => {
                try {
                    // Находим родительский элемент товара
                    let productElement = link;
                    for (let i = 0; i < 5; i++) {
                        if (productElement.parentElement) {
                            productElement = productElement.parentElement;
                        }
                    }
                    
                    const product = {
                        id: link.href.match(/product\/([^\/]+)/)?.[1] || Math.random().toString(36).substr(2, 9),
                        name: null,
                        price: null,
                        oldPrice: null,
                        discount: null,
                        image: null,
                        url: link.href
                    };
                    
                    // Название товара
                    const nameElements = productElement.querySelectorAll('h1, h2, h3, h4, [class*="name"], [class*="title"]');
                    for (const el of nameElements) {
                        if (el.textContent && el.textContent.trim().length > 5 && el.textContent.length < 100) {
                            product.name = el.textContent.trim();
                            break;
                        }
                    }
                    
                    // Цена
                    const priceElements = productElement.querySelectorAll('[class*="price"], [class*="Price"], [class*="руб"], [class*="₽"]');
                    for (const el of priceElements) {
                        const text = el.textContent.trim();
                        if (text.includes('₽')) {
                            const priceMatch = text.match(/(\d[\d\s]*)\s*₽/);
                            if (priceMatch) {
                                product.price = priceMatch[1].replace(/\s/g, '');
                                break;
                            }
                        }
                    }
                    
                    // Изображение
                    const img = productElement.querySelector('img');
                    if (img) {
                        product.image = img.src || img.dataset.src;
                    }
                    
                    // Добавляем товар если есть название
                    if (product.name && product.price) {
                        products.push(product);
                    }
                    
                } catch (e) {
                    // Пропускаем ошибки
                }
            });
            
            return products;
        });
    }

    async extractProductsWithSelectors() {
        console.log('🔍 Извлекаем товары через селекторы...');
        
        return await this.page.evaluate(() => {
            const products = [];
            
            // Популярные селекторы товаров на vprok.ru
            const productSelectors = [
                '.x-product-card', // Основной селектор
                '.product-card',
                '[data-testid="product-card"]',
                '.catalog-item',
                '.item-product',
                '.product-item'
            ];
            
            for (const selector of productSelectors) {
                const elements = document.querySelectorAll(selector);
                console.log(`Нашли ${elements.length} элементов по селектору: ${selector}`);
                
                if (elements.length > 0) {
                    elements.forEach((element, index) => {
                        try {
                            const product = {
                                id: `product_${index + 1}`,
                                name: null,
                                price: null,
                                image: null
                            };
                            
                            // Название
                            const nameSelectors = [
                                '.x-product-card-description__product-name',
                                '.product-name',
                                'h3',
                                'h4',
                                '[class*="name"]',
                                '[class*="title"]'
                            ];
                            
                            for (const nameSel of nameSelectors) {
                                const nameEl = element.querySelector(nameSel);
                                if (nameEl && nameEl.textContent) {
                                    product.name = nameEl.textContent.trim();
                                    break;
                                }
                            }
                            
                            // Цена
                            const priceSelectors = [
                                '.x-product-card-description__price-single',
                                '.product-card-price__current',
                                '[class*="price-current"]',
                                '[class*="price__current"]',
                                '.price'
                            ];
                            
                            for (const priceSel of priceSelectors) {
                                const priceEl = element.querySelector(priceSel);
                                if (priceEl && priceEl.textContent) {
                                    const text = priceEl.textContent.trim();
                                    const match = text.match(/(\d[\d\s]*)\s*₽/);
                                    if (match) {
                                        product.price = match[1].replace(/\s/g, '');
                                        break;
                                    }
                                }
                            }
                            
                            // Изображение
                            const img = element.querySelector('img');
                            if (img) {
                                product.image = img.src || img.dataset.src || img.dataset.original;
                            }
                            
                            // URL товара
                            const link = element.querySelector('a[href*="/product/"]');
                            if (link) {
                                product.url = link.href;
                            }
                            
                            if (product.name) {
                                products.push(product);
                            }
                            
                        } catch (e) {
                            console.log('Ошибка при обработке элемента:', e);
                        }
                    });
                    
                    break; // Используем первый работающий селектор
                }
            }
            
            return products;
        });
    }

    extractProductsFromHTML(html) {
        console.log('🔍 Ищем товары в HTML...');
        
        const products = [];
        
        try {
            // Ищем блоки с товарами по характерным признакам
            const productPatterns = [
                // Паттерн для vprok.ru
                /<div[^>]*class="[^"]*x-product-card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
                // Альтернативные паттерны
                /<a[^>]*href="\/product\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
                /<div[^>]*data-testid="product-card"[^>]*>([\s\S]*?)<\/div>/gi
            ];
            
            for (const pattern of productPatterns) {
                const matches = html.match(pattern);
                if (matches && matches.length > 0) {
                    console.log(`Нашли ${matches.length} товаров по паттерну`);
                    
                    matches.forEach((match, index) => {
                        try {
                            const product = {
                                id: `html_product_${index + 1}`,
                                name: null,
                                price: null
                            };
                            
                            // Название
                            const nameMatch = match.match(/<h3[^>]*>([^<]+)<\/h3>/i) ||
                                            match.match(/<h4[^>]*>([^<]+)<\/h4>/i) ||
                                            match.match(/class="[^"]*product-name[^"]*"[^>]*>([^<]+)</i);
                            
                            if (nameMatch) {
                                product.name = nameMatch[1].trim();
                            }
                            
                            // Цена
                            const priceMatch = match.match(/(\d[\d\s,]+)\s*₽/) ||
                                             match.match(/class="[^"]*price[^"]*"[^>]*>([^<]+)</i);
                            
                            if (priceMatch) {
                                product.price = priceMatch[1].replace(/[^\d]/g, '');
                            }
                            
                            // URL
                            const urlMatch = match.match(/href="(\/product\/[^"]+)"/i);
                            if (urlMatch) {
                                product.url = 'https://www.vprok.ru' + urlMatch[1];
                            }
                            
                            if (product.name && product.name.length > 3) {
                                products.push(product);
                            }
                            
                        } catch (e) {
                            // Пропускаем ошибки
                        }
                    });
                    
                    if (products.length > 0) break;
                }
            }
            
        } catch (error) {
            console.log('Ошибка при парсинге HTML:', error.message);
        }
        
        return products;
    }

    async getCategoryInfo() {
        return await this.page.evaluate(() => {
            const info = {
                name: document.title.split('|')[0].trim() || 'Категория',
                url: window.location.href
            };
            
            // Пробуем найти название категории в заголовках
            const h1 = document.querySelector('h1');
            if (h1) {
                info.name = h1.textContent.trim();
            }
            
            return info;
        });
    }

    async saveResults(categoryInfo, products, categoryUrl) {
        console.log(`💾 Сохраняем результаты (${products.length} товаров)...`);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `category_${timestamp}.json`;
        
        const result = {
            metadata: {
                parsed_at: new Date().toLocaleString('ru-RU'),
                category_url: categoryUrl,
                total_products: products.length,
                success: products.length > 0
            },
            category: categoryInfo,
            products: products
        };
        
        // Сохраняем JSON
        fs.writeFileSync(filename, JSON.stringify(result, null, 2), 'utf8');
        console.log(`✅ JSON сохранен: ${filename}`);
        
        // Сохраняем читаемый отчет
        this.saveReadableReport(result, filename.replace('.json', '_report.txt'));
        
        // Выводим статистику
        this.printStatistics(result);
    }

    saveReadableReport(data, filename) {
        let content = '='.repeat(80) + '\n';
        content += 'ОТЧЕТ: ПАРСИНГ КАТЕГОРИИ VPROK.RU\n';
        content += '='.repeat(80) + '\n\n';
        
        content += '📅 ДАТА: ' + data.metadata.parsed_at + '\n';
        content += '🔗 URL: ' + data.metadata.category_url + '\n';
        content += '📊 ТОВАРОВ: ' + data.products.length + '\n';
        content += '📁 КАТЕГОРИЯ: ' + data.category.name + '\n\n';
        
        content += '='.repeat(80) + '\n';
        content += 'СПИСОК ТОВАРОВ:\n';
        content += '='.repeat(80) + '\n\n';
        
        if (data.products.length === 0) {
            content += '❌ Товары не найдены\n';
            content += '\nВОЗМОЖНЫЕ ПРИЧИНЫ:\n';
            content += '1. Сайт изменил структуру\n';
            content += '2. Товары загружаются динамически\n';
            content += '3. Нужна авторизация\n';
            content += '4. Защита от ботов\n';
        } else {
            data.products.forEach((product, index) => {
                content += `${index + 1}. ${product.name || 'Без названия'}\n`;
                content += `   💰 Цена: ${product.price ? product.price + ' ₽' : '—'}\n`;
                if (product.oldPrice) {
                    content += `   📉 Старая цена: ${product.oldPrice} ₽\n`;
                }
                if (product.url) {
                    content += `   🔗 Ссылка: ${product.url}\n`;
                }
                content += '\n';
            });
        }
        
        content += '='.repeat(80) + '\n';
        content += 'КОНЕЦ ОТЧЕТА\n';
        content += '='.repeat(80);
        
        fs.writeFileSync(filename, content, 'utf8');
        console.log(`📄 Текстовый отчет: ${filename}`);
    }

    printStatistics(data) {
        console.log('\n📊 СТАТИСТИКА:');
        console.log('-'.repeat(40));
        console.log(`Категория: ${data.category.name}`);
        console.log(`Всего товаров: ${data.products.length}`);
        
        if (data.products.length > 0) {
            const withPrice = data.products.filter(p => p.price).length;
            const withImage = data.products.filter(p => p.image).length;
            const withUrl = data.products.filter(p => p.url).length;
            
            console.log(`С ценой: ${withPrice}`);
            console.log(`С изображением: ${withImage}`);
            console.log(`Со ссылкой: ${withUrl}`);
            
            // Топ-3 товара
            console.log('\n🏆 ПЕРВЫЕ 3 ТОВАРА:');
            data.products.slice(0, 3).forEach((product, i) => {
                console.log(`${i + 1}. ${product.name?.substring(0, 40) || 'Без названия'}...`);
                console.log(`   Цена: ${product.price || '?'} ₽`);
            });
        }
        console.log('-'.repeat(40));
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('\n👋 Браузер закрыт');
        }
    }
}

// Основная функция
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('Использование: node category_parser_v2.js <URL_категории>');
        console.log('Пример: node category_parser_v2.js "https://www.vprok.ru/catalog/7382/pomidory-i-ovoschnye-nabory"');
        return;
    }
    
    const categoryUrl = args[0];
    
    console.log('='.repeat(60));
    console.log('VPROK.RU - ПАРСЕР КАТЕГОРИЙ (v2)');
    console.log('='.repeat(60));
    console.log('⚠️  Запускаем видимый браузер для отладки');
    console.log('⚠️  Не закрывайте браузер автоматически\n');
    
    const parser = new VprokCategoryParser();
    
    try {
        await parser.init();
        
        // Даем время пользователю увидеть браузер
        console.log('Браузер открыт. Нажмите Enter в консоли для продолжения...');
        await new Promise(resolve => process.stdin.once('data', resolve));
        
        const result = await parser.parseCategory(categoryUrl);
        
        console.log('\n' + '='.repeat(60));
        if (result.products.length > 0) {
            console.log(`✅ УСПЕХ! Найдено ${result.products.length} товаров`);
        } else {
            console.log('⚠️  ВНИМАНИЕ: Товары не найдены');
            console.log('Проверьте файл debug_page.html для анализа структуры сайта');
        }
        console.log('='.repeat(60));
        
        // Ждем перед закрытием
        console.log('\nНажмите Enter для закрытия браузера...');
        await new Promise(resolve => process.stdin.once('data', resolve));
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        await parser.close();
    }
}

// Запуск
if (require.main === module) {
    main();
}