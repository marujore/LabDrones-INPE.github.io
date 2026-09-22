let map;
let feicoesVisiveisGroup;
let dadosGeoJson;
let legendaControl = null;
let osmLayer, esriImageryLayer;

// Guarda as categorias ativas/selecionadas e valores únicos
let categoriasAtivas = new Set();
let valoresUnicosAtuais = [];

const cores = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#27ae60', '#2980b9', '#8e44ad', '#f39c12', '#d35400'];

const nomesAtributos = {
    'Projeto': 'Projeto',
    'Municipio': 'Município',
    'Platform': 'Plataforma',
    'Ano': 'Ano do Voo'
};

// Ocultar/Exibir Barra Lateral
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('toggle-btn');
    sidebar.classList.toggle('collapsed');
    btn.innerText = sidebar.classList.contains('collapsed') ? '▶' : '◀';
    setTimeout(() => { map.invalidateSize(); }, 300);
}

// Alternar mapa de fundo
function mudarMapaDeFundo() {
    const tipo = document.getElementById('basemapSelect').value;
    if (tipo === 'esri') {
        map.removeLayer(osmLayer);
        esriImageryLayer.addTo(map);
    } else {
        map.removeLayer(esriImageryLayer);
        osmLayer.addTo(map);
    }
}

function extrairAno(datetimeStr) {
    if (!datetimeStr || datetimeStr === 'Não informado') return 'Ignorado';
    return datetimeStr.substring(0, 4);
}

function obterValorAtributo(properties, attr) {
    if (attr === 'Municipio') return properties.Municipio || 'Desconhecido';
    if (attr === 'Ano') return extrairAno(properties.Datetime);
    return properties[attr] || 'Não informado';
}

function obterCor(valor) {
    const index = valoresUnicosAtuais.indexOf(valor);
    return cores[index % cores.length] || '#95a5a6';
}

// Criar conteúdo do Popup
function criarConteudoPopup(properties) {
    const datetime = properties.Datetime || '';
    const dataFormatada = datetime.length >= 10 ? datetime.substring(0, 10) : 'N/A';
    const nomeVoo = properties.Nome_Voo || 'N/A';
    const projeto = properties.Projeto || 'Não informado';
    const nota = properties.Nota || 'N/A';
    const municipio = properties.Municipio || 'Desconhecido';
    const plataforma = properties.Platform || 'N/A';

    return `
        <div style="font-size: 13px; line-height: 1.5; min-width: 180px;">
            <strong style="font-size: 14px; color: #2c3e50;">Voo: ${nomeVoo}</strong><br>
            <hr style="margin: 5px 0; border: 0; border-top: 1px solid #ccc;">
            <strong>Projeto:</strong> ${projeto}<br>
            <strong>Município:</strong> <span style="color:#e74c3c; font-weight:bold;">${municipio}</span><br>
            <strong>Plataforma:</strong> ${plataforma}<br>
            <strong>Data do Voo:</strong> ${dataFormatada}<br>
            <strong>Nota:</strong> ${nota}
        </div>
    `;
}

// --- FUNÇÃO PRINCIPAL DE ATUALIZAÇÃO DO MAPA ---
function atualizarMapa() {
if (!dadosGeoJson || !feicoesVisiveisGroup) return;

// 1. Limpa totalmente o grupo (remove polígonos e marcadores de destaque anteriores)
feicoesVisiveisGroup.clearLayers();

const attrSelecionado = document.getElementById('filterAttribute').value;

// 2. Filtra mantendo apenas as feições ativas na legenda
const feicoesFiltradas = dadosGeoJson.features.filter(f => {
    const valor = obterValorAtributo(f.properties, attrSelecionado);
    return categoriasAtivas.has(valor);
});

// 3. Desenha a camada GeoJSON dos polígonos ativos
const camadaGeoJson = L.geoJSON({ type: 'FeatureCollection', features: feicoesFiltradas }, {
    style: function(feature) {
        const valor = obterValorAtributo(feature.properties, attrSelecionado);
        return {
            fillColor: obterCor(valor),
            color: "#ffffff",
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.6
        };
    },
    onEachFeature: function(feature, layer) {
        layer.bindPopup(criarConteudoPopup(feature.properties));

        // Adiciona o Marcador de Destaque no Centro do Polígono
        try {
            const centro = layer.getBounds().getCenter();
            const valor = obterValorAtributo(feature.properties, attrSelecionado);

            const marcadorDestaque = L.circleMarker(centro, {
                radius: 5,
                fillColor: obterCor(valor),
                color: '#ffffff',
                weight: 1.5,
                opacity: 1,
                fillOpacity: 0.9
            });

            marcadorDestaque.bindPopup(criarConteudoPopup(feature.properties));
            feicoesVisiveisGroup.addLayer(marcadorDestaque);
        } catch (e) {
            console.warn("Não foi possível calcular o centro da feição:", e);
        }
    }
});

// Adiciona a camada de polígonos ao grupo principal
feicoesVisiveisGroup.addLayer(camadaGeoJson);

// 4. Atualiza visualmente a legenda interativa
atualizarLegenda();

// 5. AJUSTE DO ZOOM/OVERVIEW: Reenquadra a visão do mapa para os elementos ativos
if (feicoesVisiveisGroup.getLayers().length > 0) {
    map.fitBounds(feicoesVisiveisGroup.getBounds(), {
        padding: [30, 30], // Margem em pixels nas bordas
        maxZoom: 14        // Evita zoom excessivo se houver apenas 1 elemento
    });
}
}

// --- CONSTRUÇÃO E ATUALIZAÇÃO DA LEGENDA INTERATIVA ---
function atualizarLegenda() {
    if (legendaControl) {
        map.removeControl(legendaControl);
    }

    const attrSelecionado = document.getElementById('filterAttribute').value;
    legendaControl = L.control({ position: 'topright' });

    legendaControl.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        let html = `<strong>${nomesAtributos[attrSelecionado] || attrSelecionado}</strong><br><hr style="margin: 4px 0;">`;

        valoresUnicosAtuais.forEach(val => {
            const cor = obterCor(val);
            const estaAtivo = categoriasAtivas.has(val);
            const classeEstilo = estaAtivo ? '' : 'style="opacity: 0.35; text-decoration: line-through;"';

            // Blindagem: Passa o elemento 'this' independente do texto interno
            html += `
                <div class="legend-item" onclick="alternarCategoriaLegendaSegura(this)" ${classeEstilo}>
                    <i style="background: ${cor};"></i>
                    <span>${val}</span>
                </div>
            `;
        });

        div.innerHTML = html;
        return div;
    };

    legendaControl.addTo(map);
}


// Captura o clique de forma segura lendo o texto real processado pelo navegador
function alternarCategoriaLegendaSegura(elemento) {
    const categoria = elemento.querySelector('span').innerText;
    
    if (categoriasAtivas.has(categoria)) {
        categoriasAtivas.delete(categoria);
    } else {
        categoriasAtivas.add(categoria);
    }
    atualizarMapa();
}


// Função executada ao alterar o <select id="filterAttribute">
function trocarAtributoFiltro() {
    if (!dadosGeoJson) return;

    const attr = document.getElementById('filterAttribute').value;

    // Recalcula os valores únicos da categoria selecionada
    valoresUnicosAtuais = [...new Set(dadosGeoJson.features.map(f => obterValorAtributo(f.properties, attr)))].sort();

    // Ativa todas as categorias por padrão
    categoriasAtivas = new Set(valoresUnicosAtuais);

    atualizarMapa();

    // Ajusta o enquadramento espacial no mapa
    if (feicoesVisiveisGroup.getLayers().length > 0) {
        map.fitBounds(feicoesVisiveisGroup.getBounds(), { maxZoom: 14 });
    }
}

// Exportação em CSV
function exportarGeoJsonParaCSV() {
    if (!dadosGeoJson || !dadosGeoJson.features || dadosGeoJson.features.length === 0) {
        alert("Nenhum dado disponível para exportação.");
        return;
    }

    const colunas = ["Nome_Voo", "Projeto", "Municipio", "Platform", "Datetime", "Nota"];
    let csvContent = "\uFEFF";
    csvContent += colunas.join(",") + "\n";

    dadosGeoJson.features.forEach(f => {
        const props = f.properties;
        const linha = [
            `"${(props.Nome_Voo || '').replace(/"/g, '""')}"`,
            `"${(props.Projeto || 'Não informado').replace(/"/g, '""')}"`,
            `"${(props.Municipio || 'Desconhecido').replace(/"/g, '""')}"`,
            `"${(props.Platform || '').replace(/"/g, '""')}"`,
            `"${(props.Datetime || '').replace(/"/g, '""')}"`,
            `"${(props.Nota || '').replace(/"/g, '""')}"`
        ];
        csvContent += linha.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "info_voos_labdrones.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// --- INICIALIZAÇÃO RESPONSIVA ---
// Executa automaticamente assim que a estrutura do HTML estiver pronta
window.addEventListener('DOMContentLoaded', () => {
    // Define 768px como limite máximo para ecrãs de telemóvel
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        const btn = document.getElementById('toggle-btn');
        
        // Adiciona a classe que recolhe a barra lateral
        sidebar.classList.add('collapsed');
        
        // Altera o sentido da seta do botão para a direita
        btn.innerText = '▶';
        
        // Garante que o Leaflet recalcule o tamanho correto caso o mapa já exista
        setTimeout(() => {
            if (map && typeof map.invalidateSize === 'function') {
                map.invalidateSize();
            }
        }, 300);
    }
});


// --- CARREGAMENTO INICIAL DO MAPA E DADOS ---
window.onload = function() {
    map = L.map('map', { zoomControl: false }).setView([-15.7801, -47.9292], 4);

    // Inicializa o grupo de feições visíveis
    feicoesVisiveisGroup = L.featureGroup().addTo(map);

    osmLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community'
    });

    esriImageryLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri'
    });

    osmLayer.addTo(map);

    // Carrega o GeoJSON e inicializa
    fetch('data/voos_labdrones.geojson')
        .then(response => response.json())
        .then(data => {
            dadosGeoJson = data;
            trocarAtributoFiltro();
        })
        .catch(error => console.error('Erro ao carregar o GeoJSON:', error));
};