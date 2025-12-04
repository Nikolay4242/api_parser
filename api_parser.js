const axios = require('axios');
const fs = require('fs');
const path = require('path');

class VprokApiParser {
    constructor() {
        this.baseURL = 'https://www.vprok.ru';
        this.apiURL = 'https://api.vprok.ru';
        this.session = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.vprok.ru/',
                'Origin': 'https://www.vprok.ru',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site'
            }
        });
    }

    async parseCategory(categoryUrl) {
        console.log('🚀 Начинаем парсинг категории...');
        console.log(`📁 Категория: ${categoryUrl}`);
        
        try {
            // 1. Получаем ID категории из URL
            const categoryId = this.extractCategoryId(categoryUrl);
            
            // 2. Получаем данные о категории
            const categoryData = await this.fetchCategoryData(categoryId);
            
            // 3. Получаем товары из категории
            const products = await this.fetchCategoryProducts(categoryId);
            
            // 4. Сохраняем результаты
            this.saveResults(categoryData, products, categoryUrl);
            
            return {
                category: categoryData,
                products: products,
                count: products.length
            };
            
        } catch (error) {
            console.error('❌ Ошибка при парсинге:', error.message);
            if (error.response) {
                console.error('Статус:', error.response.status);
                console.error('Данные:', error.response.data);
            }
            throw error;
        }
    }

    extractCategoryId(url) {
        // Извлекаем ID категории из URL
        // Пример: https://www.vprok.ru/catalog/7382/pomidory-i-ovoschnye-nabory
        const match = url.match(/catalog\/(\d+)/);
        if (match && match[1]) {
            return match[1];
        }
        
        // Альтернативный вариант: из названия в URL
        const slugMatch = url.match(/catalog\/\d+\/([^\/]+)/);
        if (slugMatch) {
            return slugMatch[1];
        }
        
        throw new Error('Не удалось извлечь ID категории из URL');
    }

    async fetchCategoryData(categoryId) {
        console.log('🔍 Получаем информацию о категории...');
        
        try {
            // Вариант 1: Прямой запрос к API категории
            const url = `${this.apiURL}/api/v1/catalog/category/${categoryId}`;
            
            const response = await this.session.get(url);
            
            if (response.data && response.data.success) {
                return response.data.data;
            }
            
            // Вариант 2: Если первый не сработал, пробуем другой endpoint
            const alternativeUrl = `https://www.vprok.ru/api/catalog/v1/categories/${categoryId}`;
            const altResponse = await this.session.get(alternativeUrl);
            
            return altResponse.data || {};
            
        } catch (error) {
            console.log('⚠️ Не удалось получить данные категории напрямую, используем альтернативный метод...');
            
            // Альтернативный метод: парсим HTML страницы
            const htmlResponse = await this.session.get(`https://www.vprok.ru/catalog/${categoryId}`);
            const html = htmlResponse.data;
            
            // Извлекаем данные из JSON-LD или script тегов
            const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
            if (jsonLdMatch) {
                try {
                    return JSON.parse(jsonLdMatch[1]);
                } catch (e) {
                    // Не удалось распарсить JSON
                }
            }
            
            // Ищем данные в window.__INITIAL_STATE__
            const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
            if (initialStateMatch) {
                try {
                    const state = JSON.parse(initialStateMatch[1]);
                    return state.category || state.catalog || {};
                } catch (e) {
                    // Не удалось распарсить
                }
            }
            
            return {
                id: categoryId,
                name: 'Категория',
                url: `https://www.vprok.ru/catalog/${categoryId}`
            };
        }
    }

    async fetchCategoryProducts(categoryId) {
        console.log('🛒 Получаем товары категории...');
        
        const products = [];
        
        try {
            // Основной API endpoint для товаров категории
            const apiEndpoints = [
                // Вариант 1
                `${this.apiURL}/api/v1/catalog/category/${categoryId}/products`,
                // Вариант 2
                `https://www.vprok.ru/api/catalog/v1/categories/${categoryId}/products`,
                // Вариант 3
                `https://www.vprok.ru/api/v1/catalog/products?category_id=${categoryId}`,
                // Вариант 4 (часто используемый)
                `https://www.vprok.ru/api/catalog/v1/products?category=${categoryId}&limit=100`
            ];
            
            let productsData = null;
            
            // Пробуем все возможные endpoints
            for (const endpoint of apiEndpoints) {
                try {
                    console.log(`Пробуем endpoint: ${endpoint}`);
                    const response = await this.session.get(endpoint, {
                        params: {
                            limit: 100,
                            offset: 0,
                            sort: 'popular',
                            city_code: 'spb' // код города
                        }
                    });
                    
                    if (response.data && 
                        (response.data.products || response.data.items || response.data.data)) {
                        
                        productsData = response.data;
                        console.log(`✅ Успешно с endpoint: ${endpoint}`);
                        break;
                    }
                } catch (error) {
                    console.log(`❌ Endpoint не сработал: ${endpoint}`);
                    continue;
                }
            }
            
            if (!productsData) {
                console.log('⚠️ API endpoints не сработали, пробуем эмуляцию браузера...');
                return await this.fetchProductsWithBrowser(categoryId);
            }
            
            // Извлекаем товары из ответа
            if (productsData.products) {
                products.push(...this.extractProductsFromResponse(productsData.products));
            } else if (productsData.items) {
                products.push(...this.extractProductsFromResponse(productsData.items));
            } else if (productsData.data) {
                products.push(...this.extractProductsFromResponse(productsData.data));
            } else if (Array.isArray(productsData)) {
                products.push(...this.extractProductsFromResponse(productsData));
            }
            
            // Если товаров мало, возможно нужна другая структура
            if (products.length === 0 && productsData) {
                // Пробуем найти товары в других полях
                for (const key in productsData) {
                    if (Array.isArray(productsData[key]) && productsData[key].length > 0) {
                        const firstItem = productsData[key][0];
                        if (firstItem && (firstItem.id || firstItem.product_id || firstItem.name)) {
                            products.push(...this.extractProductsFromResponse(productsData[key]));
                            break;
                        }
                    }
                }
            }
            
            return products;
            
        } catch (error) {
            console.error('Ошибка при получении товаров:', error.message);
            return [];
        }
    }

    async fetchProductsWithBrowser(categoryId) {
        console.log('🌐 Используем Puppeteer для получения данных...');
        
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        
        try {
            // Перехватываем сетевые запросы
            const products = [];
            
            page.on('response', async (response) => {
                const url = response.url();
                
                // Ищем API запросы с товарами
                if (url.includes('/api/') && 
                    (url.includes('product') || url.includes('catalog'))) {
                    
                    try {
                        const data = await response.json();
                        
                        // Ищем товары в ответе
                        const foundProducts = this.findProductsInData(data);
                        if (foundProducts.length > 0) {
                            products.push(...foundProducts);
                        }
                    } catch (e) {
                        // Не JSON ответ
                    }
                }
            });
            
            // Переходим на страницу категории
            await page.goto(`https://www.vprok.ru/catalog/${categoryId}`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            // Ждем загрузки товаров
            await page.waitForTimeout(5000);
            
            // Прокручиваем для загрузки всех товаров
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            
            await page.waitForTimeout(3000);
            
            // Также пытаемся извлечь товары из HTML
            const htmlProducts = await page.evaluate(() => {
                const items = [];
                const productElements = document.querySelectorAll('[data-product-id], .product-card, [class*="product"]');
                
                productElements.forEach(element => {
                    try {
                        const product = {
                            id: element.getAttribute('data-product-id') || 
                                 element.getAttribute('data-id') || 
                                 Math.random().toString(36).substr(2, 9),
                            name: element.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim() || 
                                  element.getAttribute('data-product-name') || 
                                  'Товар',
                            price: element.querySelector('[class*="price"]')?.textContent?.trim() || '',
                            image: element.querySelector('img')?.src || ''
                        };
                        
                        if (product.name && product.name !== 'Товар') {
                            items.push(product);
                        }
                    } catch (e) {
                        // Пропускаем ошибки
                    }
                });
                
                return items;
            });
            
            products.push(...htmlProducts);
            
            await browser.close();
            
            // Убираем дубликаты
            return this.removeDuplicates(products);
            
        } catch (error) {
            await browser.close();
            console.error('Ошибка при использовании Puppeteer:', error.message);
            return [];
        }
    }

    extractProductsFromResponse(items) {
        if (!Array.isArray(items)) {
            return [];
        }
        
        return items.map(item => {
            // Стандартизируем структуру товара
            return {
                id: item.id || item.product_id || item.sku || Math.random().toString(36).substr(2, 9),
                name: item.name || item.title || item.product_name || 'Товар без названия',
                price: item.price || item.current_price || item.price_current,
                oldPrice: item.old_price || item.price_old,
                discount: item.discount || item.discount_percent,
                rating: item.rating || item.review_rating,
                reviewsCount: item.reviews_count || item.review_count,
                weight: item.weight || item.volume,
                brand: item.brand || item.brand_name,
                image: item.image || item.image_url || item.picture,
                url: item.url || item.product_url,
                inStock: item.in_stock !== undefined ? item.in_stock : true,
                category: item.category || item.category_name
            };
        }).filter(product => product.name && product.name !== 'Товар без названия');
    }

    findProductsInData(data) {
        const products = [];
        
        if (!data) return products;
        
        // Рекурсивно ищем товары в объекте
        const findProducts = (obj) => {
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    // Проверяем, похож ли объект на товар
                    if (item && typeof item === 'object') {
                        if ((item.name || item.title) && (item.price || item.id)) {
                            products.push(this.extractProductsFromResponse([item])[0]);
                        } else {
                            findProducts(item);
                        }
                    }
                }
            } else if (obj && typeof obj === 'object') {
                for (const key in obj) {
                    if (key.includes('product') || key.includes('item')) {
                        findProducts(obj[key]);
                    }
                }
            }
        };
        
        findProducts(data);
        return products;
    }

    removeDuplicates(products) {
        const seen = new Set();
        return products.filter(product => {
            const key = `${product.id}_${product.name}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    saveResults(categoryData, products, categoryUrl) {
        console.log(`💾 Сохраняем результаты (${products.length} товаров)...`);
        
        const timestamp = new Date().toLocaleString('ru-RU');
        const filename = `category_${Date.now()}.json`;
        
        const result = {
            metadata: {
                parsed_at: timestamp,
                category_url: categoryUrl,
                category_id: categoryData.id || this.extractCategoryId(categoryUrl),
                total_products: products.length,
                parser_version: '1.0'
            },
            category: {
                id: categoryData.id,
                name: categoryData.name || categoryData.title || 'Категория',
                description: categoryData.description,
                url: categoryData.url || categoryUrl,
                product_count: categoryData.product_count || products.length
            },
            products: products
        };
        
        // Сохраняем в JSON
        fs.writeFileSync(filename, JSON.stringify(result, null, 2), 'utf8');
        console.log(`✅ Данные сохранены в файл: ${filename}`);
        
        // Также сохраняем в читаемом формате
        this.saveHumanReadable(result, filename.replace('.json', '_readable.txt'));
        
        // Выводим краткую статистику
        this.printStatistics(result);
    }

    saveHumanReadable(data, filename) {
        let content = '='.repeat(80) + '\n';
        content += 'ОТЧЕТ О ПАРСИНГЕ КАТЕГОРИИ VPROK.RU\n';
        content += '='.repeat(80) + '\n\n';
        
        content += '📅 МЕТАДАННЫЕ:\n';
        content += '-'.repeat(40) + '\n';
        content += `Дата парсинга: ${data.metadata.parsed_at}\n`;
        content += `URL категории: ${data.metadata.category_url}\n`;
        content += `ID категории: ${data.metadata.category_id}\n`;
        content += `Всего товаров: ${data.metadata.total_products}\n\n`;
        
        content += '📁 ИНФОРМАЦИЯ О КАТЕГОРИИ:\n';
        content += '-'.repeat(40) + '\n';
        content += `Название: ${data.category.name}\n`;
        if (data.category.description) {
            content += `Описание: ${data.category.description.substring(0, 200)}...\n`;
        }
        content += `URL: ${data.category.url}\n`;
        content += `Количество товаров: ${data.category.product_count}\n\n`;
        
        content += '🛒 ТОВАРЫ В КАТЕГОРИИ:\n';
        content += '-'.repeat(40) + '\n';
        
        if (data.products.length === 0) {
            content += 'Товары не найдены\n';
        } else {
            data.products.forEach((product, index) => {
                content += `\n${index + 1}. ${product.name}\n`;
                content += `   ID: ${product.id}\n`;
                content += `   Цена: ${product.price ? product.price + ' ₽' : 'Нет в наличии'}\n`;
                if (product.oldPrice) {
                    content += `   Старая цена: ${product.oldPrice} ₽\n`;
                }
                if (product.discount) {
                    content += `   Скидка: ${product.discount}%\n`;
                }
                if (product.rating) {
                    content += `   Рейтинг: ${product.rating}/5\n`;
                }
                if (product.reviewsCount) {
                    content += `   Отзывов: ${product.reviewsCount}\n`;
                }
                if (product.brand) {
                    content += `   Бренд: ${product.brand}\n`;
                }
                content += `   В наличии: ${product.inStock ? 'Да' : 'Нет'}\n`;
            });
        }
        
        content += '\n' + '='.repeat(80) + '\n';
        content += 'Парсинг выполнен успешно!\n';
        content += '='.repeat(80);
        
        fs.writeFileSync(filename, content, 'utf8');
        console.log(`✅ Читаемый отчет сохранен: ${filename}`);
    }

    printStatistics(data) {
        console.log('\n📊 СТАТИСТИКА ПАРСИНГА:');
        console.log('-'.repeat(40));
        console.log(`Категория: ${data.category.name}`);
        console.log(`Всего товаров: ${data.products.length}`);
        
        // Статистика по ценам
        const prices = data.products
            .filter(p => p.price && typeof p.price === 'number')
            .map(p => p.price);
        
        if (prices.length > 0) {
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
            
            console.log(`Минимальная цена: ${minPrice.toFixed(2)} ₽`);
            console.log(`Максимальная цена: ${maxPrice.toFixed(2)} ₽`);
            console.log(`Средняя цена: ${avgPrice.toFixed(2)} ₽`);
        }
        
        // Товары со скидкой
        const discounted = data.products.filter(p => p.discount).length;
        console.log(`Товаров со скидкой: ${discounted}`);
        
        // Товары с рейтингом
        const withRating = data.products.filter(p => p.rating).length;
        console.log(`Товаров с рейтингом: ${withRating}`);
        
        console.log('-'.repeat(40));
    }
}

// Основная функция
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('📌 Использование:');
        console.log('   node api_parser.js <URL_категории>');
        console.log('\n📝 Примеры:');
        console.log('   node api_parser.js "https://www.vprok.ru/catalog/7382/pomidory-i-ovoschnye-nabory"');
        console.log('   node api_parser.js "https://www.vprok.ru/catalog/112/moloko-syr-yaytsa"');
        console.log('   node api_parser.js "https://www.vprok.ru/catalog/4231/chay-kofe-kakao"');
        return;
    }
    
    const categoryUrl = args[0];
    
    console.log('='.repeat(60));
    console.log('API ПАРСЕР КАТЕГОРИЙ VPROK.RU');
    console.log('='.repeat(60));
    
    const parser = new VprokApiParser();
    
    try {
        const result = await parser.parseCategory(categoryUrl);
        
        console.log('\n✅ Парсинг завершен успешно!');
        console.log(`📁 Категория: ${result.category.name || 'Неизвестно'}`);
        console.log(`🛒 Товаров получено: ${result.count}`);
        console.log(`💾 Файлы сохранены в текущей директории`);
        
    } catch (error) {
        console.error('\n❌ Ошибка при выполнении:', error.message);
    }
}

// Запуск
if (require.main === module) {
    // Устанавливаем axios если его нет
    if (!require('axios')) {
        console.log('Установка axios...');
        const { execSync } = require('child_process');
        try {
            execSync('npm install axios', { stdio: 'inherit' });
        } catch (e) {
            console.log('Установите axios вручную: npm install axios');
        }
    }
    
    main();
}

module.exports = VprokApiParser;