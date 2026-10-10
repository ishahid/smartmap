#include "application.h"
#include "projectwindow.h"
#include "mapwindow.h"
#include "removelayerdialog.h"
#include "layermanager.h"
#include <qdom.h>
#include <qfiledialog.h>


ProjectWindow::ProjectWindow( QWidget* parent, const char* name, int wflags ) : QMainWindow( parent, name, wflags ) {
    setIcon( QPixmap("images/document.png") );

	// add MapWindow to the project window
	mapWindow = new MapWindow( this, "MapWindow" );
	this->setCentralWidget( mapWindow );
	saved = true;
	firstSave = true;
	projName = "Unnamed.smproj";

	connect( mapWindow, SIGNAL( message(const QString&) ), this, SLOT( msg(const QString&) ) );
	connect( mapWindow, SIGNAL( message(const QString&, int) ), this, SLOT( msg(const QString&, int ) ) );
	connect( mapWindow, SIGNAL( layerRemoved( int ) ), this, SLOT( resendLayerRemoved( int ) ) );
	connect( mapWindow, SIGNAL( layerAddedAt( int, QString& ) ), this, SLOT( resendLayerAddedAt( int, QString& ) ) );
	connect( mapWindow, SIGNAL( cosmeticLayer( bool ) ), this, SLOT( resendCosmeticLayer( bool ) ) );
}

ProjectWindow::~ProjectWindow() {
	// Destruction code goes here
}

void
ProjectWindow::addLayer() {
	QString fn = QFileDialog::getOpenFileName( QDir::currentDirPath(),
											   "ESRI Shapefile (*.shp)",
                    						   this,
						                       "open file dialog",
                    						   "Choose a Shapefile to open" );
	if ( !fn.isEmpty() ) {
		mapWindow->addLayer( fn );
		int n = mapWindow->layerCount() - 1;
		emit layerAdded( mapWindow->layerName( n ), n );
	} else {
		emit message( "Operation 'Add Layer' cancelled", 2000 );
    }
}

void
ProjectWindow::zoomIn() {
	if ( mapWindow->mode() != MapWindow::ZoomInMode ) {
		mapWindow->setMode( MapWindow::ZoomInMode );
		emit message( "" );
	} else {
		mapWindow->setMode( MapWindow::NormalMode );
		emit message( "" );
	}
}

void
ProjectWindow::zoomOut() {
	if ( mapWindow->mode() != MapWindow::ZoomOutMode ) {
		mapWindow->setMode( MapWindow::ZoomOutMode );
		emit message( "" );
	} else {
		mapWindow->setMode( MapWindow::NormalMode );
		emit message( "" );
	}
}

void ProjectWindow::zoomFull() {
	mapWindow->setDefaults();
	emit message( "Zoomed to Full Extent", 2000 );
	saved = false;
}

void
ProjectWindow::pan() {
	if ( mapWindow->mode() != MapWindow::PanMode ) {
		mapWindow->setMode( MapWindow::PanMode );
		emit message( "" );
	} else {
		mapWindow->setMode( MapWindow::NormalMode );
		emit message( "" );
	}
}

void
ProjectWindow::identify() {
	if ( mapWindow->mode() != MapWindow::IdentifyMode ) {
		mapWindow->setMode( MapWindow::IdentifyMode );
	} else {
		mapWindow->setMode( MapWindow::NormalMode );
		emit message( "" );
	}
}

void
ProjectWindow::closeEvent( QCloseEvent *e ) {
	if ( !saved ) {
		switch( QMessageBox::warning( this, "SmartMap", "Save changes to " + projName + "?", QMessageBox::Yes, QMessageBox::No, QMessageBox::Cancel ) ) {
			case QMessageBox::Yes:		save();
										e->accept();
										emit closed();
										emit cosmeticLayer( false );
										break;
			case QMessageBox::No:		e->accept();
										emit closed();
										emit cosmeticLayer( false );
										break;
			case QMessageBox::Cancel:	e->ignore();
		};
	}
	else {
		QMainWindow::closeEvent( e );
		emit closed();
		emit cosmeticLayer( false );
		emit message( "" );
	}
}

void
ProjectWindow::focusInEvent( QFocusEvent *e ) {
	QMainWindow::focusInEvent( e );
	emit focused();
	emit cosmeticLayer( mapWindow->isCosmeticLayerOn() );
}

void
ProjectWindow::load( const QString& fn ) {
	QFile file( fn );
	QDomDocument doc;
	if ( file.open( IO_ReadOnly ) ) {
		if ( doc.setContent( &file ) ) {
			QDomElement rootElement = doc.documentElement();
			traverseNode( rootElement );
		}
	}
	projName = fn;
	this->setCaption( projName );
}

void
ProjectWindow::traverseNode( QDomNode& node ) {
	QDomNode layerParent = node.firstChild();		// <Layers>
	QDomAttr attribute = layerParent.toElement().attributeNode( "ScaleFactor" );
	QDomAttr attPanX = layerParent.toElement().attributeNode( "PanX" );
	QDomAttr attPanY = layerParent.toElement().attributeNode( "PanY" );

    // set the scaleFactor
    double sf = attribute.value().toDouble();
	mapWindow->setScaleFactor( sf );

	// set the panPoint
	mapWindow->setPanXY( attPanX.value().toInt(), attPanY.value().toInt() );

	layerParent = layerParent.firstChild();			// <CosmeticLayer>
	QDomNode layerChild = layerParent.firstChild();
	QDomElement elem = layerChild.toElement();
	QString clpath = elem.text();

	/***********************************************
		read & add the cosmetic layer to mapWindow
	***********************************************/
	if ( !clpath.isEmpty() )
		mapWindow->readCosmeticLayer( clpath );
	/**********************************************/


	layerParent = layerParent.nextSibling();			// <Layer>
	while ( !layerParent.isNull() ) {
		layerChild = layerParent.firstChild();
		elem = layerChild.toElement();
		QString name = elem.text();

		layerChild = layerChild.nextSibling();
		elem = layerChild.toElement();
		QString path = elem.text();

		layerChild = layerChild.nextSibling();
		elem = layerChild.toElement();
		QString fillColor = elem.text();

		layerChild = layerChild.nextSibling();
		elem = layerChild.toElement();
		QString lineColor = elem.text();

		layerChild = layerChild.nextSibling();
		elem = layerChild.toElement();
		bool visible = QString::compare( elem.text(), "true" )==0? true: false;

		/***********************************************
			construct and add the layer to mapWindow
		***********************************************/
		MapLayer* layer = new MapLayer( mapWindow, path, QColor( fillColor ), QColor( lineColor ) );
		layer->setName( name );
		layer->setVisible( visible );
		mapWindow->addLayer( layer );
		int n = mapWindow->layerCount() - 1;
		emit addLayerPanelItem( mapWindow->layerName( n ), n, visible );
		/**********************************************/

		layerParent = layerParent.nextSibling();
	}

	this->saved = true;
	this->firstSave = false;
}

void
ProjectWindow::save() {
	if ( firstSave )
		saveAs();
	else
		_save();
}

void
ProjectWindow::saveAs() {
	QString fn = QFileDialog::getSaveFileName(
		                    QDir::currentDirPath(),
		                    "SmartMap Project (*.smproj)",
		                    this,
		                    "save file dialog"
		                    "Choose a filename to save project" );
	if ( !fn.isEmpty() ) {
		firstSave = false;
		if ( !fn.endsWith( ".smproj" ) )
			fn += ".smproj";
		projName = fn;
		_save();
		this->setCaption( projName );
	}
}

void
ProjectWindow::_save() {
	if ( !projName.isEmpty() ) {
		QFile file( projName );
		if ( !file.open( IO_WriteOnly ) )
			return;
		QTextStream ts( &file );
		ts << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" << endl;
		ts << "<SmartMapProject>" << endl;
		ts << "  <Layers ScaleFactor=\"" + QString::number( mapWindow->scaleFactor(), 'f' ) +
			  "\" PanX=\"" + QString::number( mapWindow->panXY().x() ) +
			  "\" PanY=\"" + QString::number( mapWindow->panXY().y() ) + "\">" << endl;

		ts << "    <CosmeticLayer>" << endl;
		ts << "      <Path>";
		if ( mapWindow->isCosmeticLayerOn() )
			ts << mapWindow->cosmeticLayerPath();
		ts << "</Path>" << endl;
		ts << "    </CosmeticLayer>" << endl;

		for ( int i=0; i<mapWindow->layerCount(); i++) {
			ts << "    <Layer>" << endl;
			ts << "      <Name>" + mapWindow->layerName( i ) + "</Name>" << endl;
			ts << "      <Path>" + mapWindow->shpPath( i ) + "</Path>" << endl;
			ts << "      <FillColor>" + mapWindow->fillColor( i ).name() + "</FillColor>" << endl;
			ts << "      <LineColor>" + mapWindow->lineColor( i ).name() + "</LineColor>" << endl;
			if ( mapWindow->isVisible( i ) )
				ts << "      <Visible>true</Visible>" << endl;
			else
				ts << "      <Visible>false</Visible>" << endl;
			ts << "    </Layer>" << endl;
		}

		ts << "  </Layers>" << endl;
		ts << "</SmartMapProject>" << endl;

		mapWindow->saveCosmeticLayer();

		saved = true;
	}
}

void
ProjectWindow::msg(const QString& str ) {
	emit message( str );
}

void
ProjectWindow::msg(const QString& str, int i ) {
	emit message( str, i );
}

void
ProjectWindow::removeLayer() {
	RemoveLayerDialog dlg( mapWindow );
	dlg.exec();
	mapWindow->draw();
}

void
ProjectWindow::layerManager() {
	LayerManager lm( mapWindow );
	connect( &lm, SIGNAL( swapped( int, int ) ), this, SLOT( resendSwapped( int, int ) ) );
	lm.exec();
	mapWindow->draw();
}

void
ProjectWindow::resendLayerRemoved( int i ) {
	emit layerRemoved( i );
}

void
ProjectWindow::resendLayerAddedAt( int index, QString& name ) {
	emit layerAddedAt( index, name );
}

void
ProjectWindow::changeVisibility( int index, bool flag ) {
	int n = mapWindow->layerCount()-( index+1 );
	mapWindow->setVisible( n, flag );
	saved = false;
}

void
ProjectWindow::copyImageToFile() {
	QString fn = QFileDialog::getSaveFileName(
                    QDir::currentDirPath(),
                    "Images (*.png)",
                    this,
                    "save file dialog"
                    "Choose a filename to save image" );

	mapWindow->copyImageToFile( fn );
}

int
ProjectWindow::layerCount() {
	return mapWindow->layerCount();
}

QString
ProjectWindow::layerName( int index ) {
	return mapWindow->layerName( index );
}

bool
ProjectWindow::isVisible( int layerIndex ) {
	return mapWindow->isVisible( layerIndex );
}

void
ProjectWindow::setSaved( bool flag ) {
	saved = flag;
}

void
ProjectWindow::resendCosmeticLayer( bool flag ) {
	emit cosmeticLayer( flag );
}

void ProjectWindow::addCosmeticLayer() {
	QString fn = QFileDialog::getSaveFileName(
					QDir::currentDirPath(),
					"SmartMap Cosmetic Layer (*.scl)",
					this,
					"save file dialog"
					"Choose a filename to save Cosmetic Layer" );

	if ( !fn.isEmpty() ) {
		mapWindow->addCosmeticLayer( fn );
		this->saved = false;
	}
}

void ProjectWindow::drawPoint() {
	if ( mapWindow->mode() != MapWindow::PointMode ) {
		mapWindow->setMode( MapWindow::PointMode );
	} else {
		mapWindow->setMode( MapWindow::NormalMode );
		emit message( "" );
	}
}

void ProjectWindow::drawLine() {
	if ( mapWindow->mode() != MapWindow::LineMode ) {
		mapWindow->setMode( MapWindow::LineMode );
	} else {
		mapWindow->setMode( MapWindow::NormalMode );
		emit message( "" );
	}
}

void ProjectWindow::drawCircle() {
	if ( mapWindow->mode() != MapWindow::CircleMode ) {
		mapWindow->setMode( MapWindow::CircleMode );
	} else {
		mapWindow->setMode( MapWindow::NormalMode );
		emit message( "" );
	}
}

void ProjectWindow::drawPolygon() {
	if ( mapWindow->mode() != MapWindow::PolygonMode ) {
		mapWindow->setMode( MapWindow::PolygonMode );
	} else {
		mapWindow->setMode( MapWindow::NormalMode );
		emit message( "" );
	}
}

void ProjectWindow::cut() {}
void ProjectWindow::copy() {}
void ProjectWindow::paste() {}
void ProjectWindow::del() {}
