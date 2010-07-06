#include "mapwindow.h"

MapWindow::MapWindow( ProjectWindow* parent, const char* name ) : QFrame( parent, name ) {
	this->setPaletteBackgroundColor( Qt::white );

	connect( this, SIGNAL( layerAdded() ), this, SLOT( draw() ) );
	connect( this, SIGNAL( scaleFactorChanged() ), this, SLOT( draw() ) );

	layers = new QPtrList<MapLayer>();	// create empty list of MapLayer
	cLayer = NULL;						// no cosmetic layer
	_scaleFactor = 1.00;				// the default scale factor; 0.99, just under actual size
	_mode = NormalMode;					// the default mode of MapWindow
	lastPoint = QPoint( 0, 0 );   		// last mouse position when user clicked
	currPoint = QPoint( 0, 0 );
	panPoint = QPoint( 0, 0 );
	lineFromPoint = QPoint( 0, 0 );
	lineToPoint = QPoint( 0, 0 );
	tempPoint = QPoint( 0, 0 );
	isButtonPressed = false;
	firstDraw = true;

	setMouseTracking( true );
	Convert::init( this->width(), this->height() );
}

MapWindow::~MapWindow() {

}

void
MapWindow::setDefaults() {
	lastPoint = QPoint( 0, 0 );
	currPoint = QPoint( 0, 0 );
	panPoint = QPoint( 0, 0 );
	_scaleFactor = 1.00;
	repaint( false );
}

void
MapWindow::addLayer( QString& shapefile ) {
	MapLayer* layer = new MapLayer( this, shapefile, mapColors.fillColor(), mapColors.lineColor() );

	if ( layer->valid() ) {
		layers->append( layer );		// add this layer to the end of list
		emit layerAdded();
		((ProjectWindow*)parent())->setSaved( false );
	} else {
		QMessageBox::critical( this, "Add Layer...", layer->errorMessage(), "Ok" );
	}
}

void
MapWindow::addLayer( MapLayer* layer ) {
	if ( layer->valid() ) {
		layers->append( layer );		// add this layer to the end of list
		emit layerAdded();
	} else {
		QMessageBox::critical( this, "Add Layer...", layer->errorMessage(), "Ok" );
	}
}

double
MapWindow::scaleFactor() {
	return _scaleFactor;
}

void
MapWindow::setScaleFactor( double newSF ) {
	if ( newSF > 0 ) {
		_scaleFactor = newSF;
		((ProjectWindow*)parent())->setSaved( false );
	}
}

void
MapWindow::draw() {
	if ( (mode() == PanMode || mode() == ZoomInMode || mode() == ZoomOutMode) && (currPoint != lastPoint) ) {
		panPoint = panPoint + ( currPoint - lastPoint );
	}
	QSize mapWinSize = this->size();

	Convert::init( mapWinSize.width(), mapWinSize.height() );

	buffer = QPixmap( mapWinSize );
	buffer.fill( Qt::white );
	painter = QPainter( &buffer );
	painter.setViewport( 0, 0, mapWinSize.width(), mapWinSize.height() );
	painter.translate( panPoint.x(), panPoint.y() );

	QPtrListIterator<MapLayer> iterator( *layers );

	MapLayer *layer;
	while ( ( layer = iterator.current() ) != 0 ) {
		if ( layer->visible() )
			layer->draw( _scaleFactor, painter );
		++iterator;
    }

	if ( cLayer )	// draw cosmetic layer
		cLayer->draw( _scaleFactor, painter );

	painter.end();
	currPoint = lastPoint;
	bitBlt( this, 0, 0, &buffer );
}

void
MapWindow::paintEvent( QPaintEvent *e ) {
	this->draw();
}

void
MapWindow::resizeEvent ( QResizeEvent *e ) {
	Convert::reinit( e->size().width(), e->size().height() );
	repaint( false );
}

void
MapWindow::mousePressEvent( QMouseEvent *e ) {
	if ( mode() == PanMode || mode() == ZoomInMode || mode() == ZoomOutMode ) {
		lastPoint = e->pos();
	}

	if ( mode() == LineMode ) {
		lineFromPoint = e->pos() - panPoint;
		tempPoint = lineFromPoint;
	}

	isButtonPressed = true;
}

void
MapWindow::mouseReleaseEvent ( QMouseEvent *e ) {
	ShapePoint* shpPoint = NULL;
	ShapeCLLine* shpLine = NULL;
	QPoint p;

	switch( mode() ) {
		case PanMode:		currPoint = e->pos();
							break;

		case ZoomInMode:	currPoint = QPoint( this->size().width()/2, this->size().height()/2 );
							setScaleFactor( scaleFactor() + 1.0 );
							Convert::setCenter( Convert::pixelToDegreeX( lastPoint.x(), _scaleFactor ),
												Convert::pixelToDegreeY( lastPoint.y(), _scaleFactor ) );
							emit message( "Scale Factor changed to " + QString::number( _scaleFactor ) );
							break;

		case ZoomOutMode:	currPoint = QPoint( this->size().width()/2, this->size().height()/2 );
							if ( scaleFactor() > 1.0 )
								setScaleFactor( scaleFactor() - 1.0 );
							Convert::setCenter( Convert::pixelToDegreeX( lastPoint.x(), _scaleFactor ),
												Convert::pixelToDegreeY( lastPoint.y(), _scaleFactor ) );
							emit message( "Scale Factor changed to " + QString::number( _scaleFactor ) );
							break;

		case PointMode:		p = e->pos();
							p = p - panPoint;
							shpPoint = new ShapePoint(
													cLayer->shapeCount(),
													Convert::pixelToDegreeX( p.x(), _scaleFactor ),
													Convert::pixelToDegreeY( p.y(), _scaleFactor ) );
							cLayer->addShape( shpPoint );
							((ProjectWindow*)parent())->setSaved( false );
							break;

		case LineMode:		lineToPoint = e->pos();
							lineToPoint = lineToPoint - panPoint;
							QPtrList<Point> plist;
							double x = Convert::pixelToDegreeX( lineFromPoint.x(), _scaleFactor );
							double y = Convert::pixelToDegreeY( lineFromPoint.y(), _scaleFactor );
							plist.append( new Point( x, y ) );
							x = Convert::pixelToDegreeX( lineToPoint.x(), _scaleFactor );
							y = Convert::pixelToDegreeY( lineToPoint.y(), _scaleFactor );
							plist.append( new Point( x, y ) );
							shpLine = new ShapeCLLine( cLayer->shapeCount(), plist );
							cLayer->addShape( shpLine );
							((ProjectWindow*)parent())->setSaved( false );
							break;
	};

	isButtonPressed = false;
	repaint(false);
}

void
MapWindow::mouseMoveEvent( QMouseEvent *e ) {
	if ( mode() == PanMode && isButtonPressed == true ) {
		QRegion r1( this->rect(), QRegion::Rectangle );
		currPoint = e->pos();
		QPoint diff = QPoint( currPoint - lastPoint );
		QRegion r2( diff.x(), diff.y(), this->width(), this->height() );
		QRegion r3 = r1.eor( r2 );
		erase( r3 );
		if ( currPoint != lastPoint )
			bitBlt( this, diff , &buffer );

		((ProjectWindow*)parent())->setSaved( false );
	}

	if ( mode() == LineMode && isButtonPressed == true ) {
		int left, top, right, bottom;
		if ( lineFromPoint.x() > tempPoint.x() ) {
			left = tempPoint.x();
			right = lineFromPoint.x();
		} else {
			left = lineFromPoint.x();
			right = tempPoint.x();
		}

		if ( lineFromPoint.y() > tempPoint.y() ) {
			top = tempPoint.y();
			bottom = lineFromPoint.y();
		} else {
			top = lineFromPoint.y();
			bottom = tempPoint.y();
		}

		QPoint lt( left, top );
		QPoint rb( right, bottom );
		QRect rect( lt, rb );

		bitBlt( this, lt, &buffer, rect );

		painter.begin( this );
		painter.translate( panPoint.x(), panPoint.y() );

		tempPoint = e->pos();
		tempPoint = tempPoint - panPoint;

		painter.setPen( QPen( QColor( 255,  0, 0 ), 2, Qt::SolidLine ) );
		//painter.setBrush( _fillColor );
		painter.drawLine( lineFromPoint, tempPoint );

		painter.end();
	}

	if ( mode() >= IdentifyMode ) {		// display long/lat for multiple modes
			QPoint p = e->pos();
			p = p - panPoint;

			QString str;
			str  = "Longitude: ";
			str += QString::number( Convert::pixelToDegreeX( p.x(), _scaleFactor ), 'f', 4 );
			str += "   Latitude: ";
			str += QString::number( Convert::pixelToDegreeY( p.y(), _scaleFactor ), 'f', 4 );
			emit message( str );
	}
}

MapWindow::DrawMode
MapWindow::mode() {
	return _mode;
}

void
MapWindow::setMode( MapWindow::DrawMode m ) {
	if ( ( m >= NormalMode ) && ( m <= BitmapMode ) ) {
		_mode = m;
		switch( _mode ) {
		case NormalMode:	this->setCursor( QCursor( Qt::ArrowCursor ) ); break;
		case ZoomInMode:	this->setCursor( QCursor( QPixmap( "./images/toolszoomin.xpm" ) ) ); break;
		case ZoomOutMode:	this->setCursor( QCursor( QPixmap( "./images/toolszoomout.xpm" ) ) ); break;
		case ZoomFullMode:	this->setCursor( QCursor( QPixmap( "./images/toolszoomfull.png" ) ) ); break;
		case PanMode:		this->setCursor( QCursor( Qt::PointingHandCursor ) ); break;
		case IdentifyMode:
		case PointMode:
		case LineMode:
		case CircleMode:
		case PolygonMode:
		case BitmapMode:	this->setCursor( QCursor( Qt::CrossCursor ) ); break;
		};
	}
}

void
MapWindow::removeLayer( int index ) {
	int n = layerCount()-( index+1 );
	layers->remove( index );
	emit layerRemoved( n );
	emit scaleFactorChanged();
	((ProjectWindow*)parent())->setSaved( false );
}

int
MapWindow::layerCount() {
	return layers->count();
}

QString
MapWindow::layerName( int index ) {
	return layers->at( index )->name();
}

MapLayer*
MapWindow::layerAt( int index ) {
	return layers->at( index );
}

void
MapWindow::addLayerAt( MapLayer* layer, int index ) {
	int n = this->layerCount()-( index+1 );
	layers->insert( index, layer );
	emit layerAdded();
	emit layerAddedAt( n, layerName( index ) );
	((ProjectWindow*)parent())->setSaved( false );
}

QColor
MapWindow::fillColor( int index ) {
	return layers->at( index )->fillColor();
}

QColor
MapWindow::lineColor( int index ) {
	return layers->at( index )->lineColor();
}

void
MapWindow::setFillColor( int index, QColor& color ) {
	layers->at( index )->setFillColor( color );
	emit scaleFactorChanged();	// just to redraw the mapWindow in place
	((ProjectWindow*)parent())->setSaved( false );
}

void
MapWindow::setLineColor( int index, QColor& color ) {
	layers->at( index )->setLineColor( color );
	emit scaleFactorChanged();	// just to redraw the mapWindow in place
	((ProjectWindow*)parent())->setSaved( false );
}

void
MapWindow::setVisible( int index, bool flag ) {
	if ( layers->at( index )->visible() != flag ) {
		layers->at( index )->setVisible( flag );
		emit scaleFactorChanged();	// just to redraw the mapWindow in place
	}
}

bool
MapWindow::isVisible( int layerIndex ) {
	return layers->at( layerIndex )->visible();
}

void
MapWindow::copyImageToFile( QString& fn ) {
	if ( !fn.isEmpty() )
		buffer.save( fn, "png" );
}

QString
MapWindow::shpPath( int index ) {
	return layers->at( index )->shpPath();
}

void
MapWindow::setPanXY( int x, int y ) {
	panPoint.setX( x );
	panPoint.setY( y );
}

QPoint
MapWindow::panXY() {
	return panPoint;
}

bool
MapWindow::isCosmeticLayerOn() {
	if ( cLayer )
		return true;
	else
		return false;
}

void
MapWindow::saveCosmeticLayer() {
	if ( cLayer )
		cLayer->save();
}

void
MapWindow::addCosmeticLayer( QString& scl ) {
	cLayer = new CosmeticLayer( this );
	cLayer->setName( scl );
	emit cosmeticLayer( true );
}

void
MapWindow::readCosmeticLayer( QString& scl ) {
	cLayer = new CosmeticLayer( this, scl );
	emit cosmeticLayer( true );
}

QString
MapWindow::cosmeticLayerPath() {
	if ( cLayer )
		return cLayer->path();
	else
		return "";
}
